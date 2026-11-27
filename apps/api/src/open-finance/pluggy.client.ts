/**
 * Cliente HTTP da API do Pluggy (agregador de Open Finance regulado).
 *
 * Por que Pluggy: no Brasil, o Open Finance é mediado por instituições
 * autorizadas pelo Banco Central. O Pluggy faz o papel de iniciador/agregador —
 * o usuário autoriza o consentimento no app do banco, e nós lemos contas e
 * lançamentos por API. Nunca armazenamos senha bancária: as credenciais ficam
 * criptografadas do lado do provedor.
 *
 * Esta é uma implementação própria sobre `fetch` (sem SDK de terceiro) para
 * manter a superfície de dependências do projeto pequena e auditável.
 *
 * Contrato (docs.pluggy.ai, conferido em 2026-11):
 * - `POST /auth` { clientId, clientSecret } → { apiKey }, válida por 2 h.
 * - `POST /connect_token` { options: { clientUserId, webhookUrl } } → { accessToken },
 *   válido por 30 min e escopo restrito ao item que o widget criar.
 * - `GET /items/{id}` → { id, status, executionStatus, clientUserId, ... }.
 * - `GET /accounts?itemId=` → paginado { results: [{ id, name, type, subtype, balance,
 *   currencyCode, ... }] }.
 * - `GET /v2/transactions?accountId=&dateFrom=&after=` → { results: [{ id, description,
 *   amount, date, status, type }], next }, `amount` em reais (decimal), negativo em
 *   débito. O `next` é a query string da próxima página (cursor opaco).
 */
import { Logger } from '@nestjs/common';

const DEFAULT_BASE_URL = 'https://api.pluggy.ai';
/** A API key do Pluggy expira em 2 h; renovamos um pouco antes. */
const API_KEY_TTL_MS = 110 * 60 * 1000;

export type PluggyAccount = {
  id: string;
  name: string;
  type: 'BANK' | 'CREDIT';
  subtype?: string | null;
  balance: number;
  currencyCode?: string;
  itemId: string;
  marketingName?: string | null;
};

export type PluggyTransaction = {
  id: string;
  description: string;
  /** Em reais. Negativo = saída da conta. */
  amount: number;
  date: string;
  status?: string;
  type?: 'CREDIT' | 'DEBIT';
  category?: string | null;
};

export type PluggyItem = {
  id: string;
  status: string;
  executionStatus?: string | null;
  /**
   * `clientUserId` que **nós** informamos ao criar o connect token. É o vínculo
   * do item com o usuário do app — a única prova confiável de titularidade,
   * já que o `itemId` sozinho é um identificador opaco (quem o obtiver não deve
   * conseguir importar a conta de outra pessoa).
   */
  clientUserId?: string | null;
  error?: { code?: string; message?: string } | null;
};

type Page<T> = { results: T[]; total?: number; totalPages?: number; page?: number };

export class PluggyConfigError extends Error {}

export class PluggyClient {
  private readonly logger = new Logger(PluggyClient.name);
  private apiKey: string | null = null;
  private apiKeyExpiresAt = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly baseUrl: string = process.env.PLUGGY_BASE_URL ?? DEFAULT_BASE_URL,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  /** `true` quando as credenciais estão configuradas no ambiente. */
  static configured(): boolean {
    return Boolean(
      process.env.PLUGGY_CLIENT_ID?.trim() && process.env.PLUGGY_CLIENT_SECRET?.trim()
    );
  }

  static fromEnv(): PluggyClient {
    const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
    const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new PluggyConfigError(
        'Pluggy não configurado: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.'
      );
    }
    return new PluggyClient(clientId, clientSecret);
  }

  /** Troca as credenciais da aplicação por uma API key temporária (cacheada). */
  async getApiKey(): Promise<string> {
    if (this.apiKey && Date.now() < this.apiKeyExpiresAt) return this.apiKey;

    const response = await this.request('/auth', {
      method: 'POST',
      body: { clientId: this.clientId, clientSecret: this.clientSecret },
      skipAuth: true,
    });
    const apiKey = (response as { apiKey?: string }).apiKey;
    if (!apiKey) {
      throw new PluggyConfigError('Pluggy não devolveu apiKey em POST /auth.');
    }
    this.apiKey = apiKey;
    this.apiKeyExpiresAt = Date.now() + API_KEY_TTL_MS;
    return apiKey;
  }

  /**
   * Token de curta duração para o widget Connect no navegador.
   *
   * `clientUserId` liga o item ao nosso usuário (o webhook e a listagem usam
   * isso para saber de quem é a conexão). `webhookUrl` faz o Pluggy avisar
   * quando o item é sincronizado, em vez de depender só do polling.
   */
  async createConnectToken(options: {
    clientUserId: string;
    webhookUrl?: string;
    oauthRedirectUri?: string;
    itemId?: string;
  }): Promise<{ accessToken: string }> {
    const response = await this.request('/connect_token', {
      method: 'POST',
      body: {
        ...(options.itemId ? { itemId: options.itemId } : {}),
        options: {
          clientUserId: options.clientUserId,
          ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
          ...(options.oauthRedirectUri ? { oauthRedirectUri: options.oauthRedirectUri } : {}),
          avoidDuplicates: true,
        },
      },
    });
    const accessToken = (response as { accessToken?: string }).accessToken;
    if (!accessToken) {
      throw new PluggyConfigError('Pluggy não devolveu accessToken em POST /connect_token.');
    }
    return { accessToken };
  }

  async getItem(itemId: string): Promise<PluggyItem> {
    return (await this.request(`/items/${encodeURIComponent(itemId)}`)) as PluggyItem;
  }

  /** Percorre todas as páginas: `results` nunca fica truncado por pageSize. */
  async listAccounts(itemId: string): Promise<PluggyAccount[]> {
    return this.paginate<PluggyAccount>(
      `/accounts?itemId=${encodeURIComponent(itemId)}&pageSize=500`
    );
  }

  /**
   * Lançamentos de uma conta, opcionalmente a partir de uma data (yyyy-mm-dd).
   *
   * Usa `GET /v2/transactions` (cursor): o endpoint por página
   * (`GET /transactions`) está depreciado, responde `410 ENDPOINT_DEPRECATED`
   * para aplicações novas e sai do ar em 2026-12-31.
   *
   * O `next` devolvido pelo provedor é uma query string pronta
   * (`?accountId=…&after=…`). Reaproveitamos **apenas** o `after`: montar a
   * próxima chamada com a nossa própria query mantém accountId e janela de
   * datas sob nosso controle (uma resposta não decide o que consultamos).
   */
  async listTransactions(accountId: string, dateFrom?: string): Promise<PluggyTransaction[]> {
    // Deduplicado por id: se o provedor repetir uma página (ou o cursor), o
    // mesmo lançamento não entra duas vezes na importação.
    const byId = new Map<string, PluggyTransaction>();
    const seen = new Set<string>();
    let after: string | null = null;

    // Teto de segurança: 200 páginas × 500 = 100 mil lançamentos por conta.
    for (let page = 0; page < 200; page += 1) {
      const query = new URLSearchParams({ accountId });
      if (dateFrom) query.set('dateFrom', dateFrom);
      if (after) query.set('after', after);

      const data = (await this.request(`/v2/transactions?${query.toString()}`)) as {
        results?: PluggyTransaction[];
        next?: string | null;
      };
      for (const transaction of data.results ?? []) {
        byId.set(transaction.id, transaction);
      }

      const cursor = this.cursorFrom(data.next);
      if (!cursor || seen.has(cursor)) break;
      seen.add(cursor);
      after = cursor;
    }

    return [...byId.values()];
  }

  /** Extrai só o `after` de um `next` (query string, URL relativa ou cursor cru). */
  private cursorFrom(next?: string | null): string | null {
    if (!next) return null;
    const raw = next.trim();
    if (!raw) return null;
    if (!raw.includes('=')) return raw; // cursor cru
    const queryIndex = raw.indexOf('?');
    const search = queryIndex >= 0 ? raw.slice(queryIndex + 1) : raw;
    return new URLSearchParams(search).get('after');
  }

  private async paginate<T>(path: string): Promise<T[]> {
    const all: T[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const separator = path.includes('?') ? '&' : '?';
      const data = (await this.request(`${path}${separator}page=${page}`)) as Page<T>;
      all.push(...(data.results ?? []));
      totalPages = data.totalPages ?? 1;
      page += 1;
      // Trava de segurança: 50 páginas × 500 = 25 mil registros por chamada.
      if (page > 50) break;
    } while (page <= totalPages);
    return all;
  }

  private async request(
    path: string,
    options: { method?: string; body?: unknown; skipAuth?: boolean } = {}
  ): Promise<unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!options.skipAuth) {
      headers['X-API-KEY'] = await this.getApiKey();
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      // O corpo do erro do Pluggy é útil para diagnosticar (credencial inválida,
      // item não encontrado), mas nunca contém segredo nosso.
      const detail = await response.text().catch(() => '');
      this.logger.warn(`Pluggy ${options.method ?? 'GET'} ${path} → ${response.status}`);
      throw new PluggyRequestError(response.status, path, detail.slice(0, 500));
    }

    if (response.status === 204) return null;
    return response.json();
  }
}

/** Erro de resposta do provedor, com o status HTTP preservado. */
export class PluggyRequestError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly detail: string
  ) {
    super(`Pluggy respondeu ${status} em ${path}`);
    this.name = 'PluggyRequestError';
  }
}
