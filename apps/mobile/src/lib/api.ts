import type {
  ApiAccount,
  ApiCategory,
  ApiTransaction,
  AuthResponse,
} from '@meufinanceiro/shared-types';

/**
 * Cliente da API no app.
 *
 * O app antes era só um protótipo com números fixos. Aqui ele passa a falar
 * com o mesmo backend da web, com token Bearer (o mobile não usa cookie: não
 * existe navegador para guardar `HttpOnly`, e o token explícito é o que o app
 * consegue mandar em cada requisição).
 *
 * Este arquivo **não importa `react-native`** de propósito: assim ele roda em
 * teste de unidade sem simulador.
 */

export type ApiClientOptions = {
  /** Ex.: `https://meufinanceiro-api-davi-lima2.vercel.app/api`. */
  baseUrl: string;
  /** Injetado nos testes; no app é o `fetch` global. */
  fetchImpl?: typeof fetch;
  /** Chamado quando o servidor responde 401 (sessão revogada/expirada). */
  onUnauthorized?: () => void;
};

export type Snapshot = {
  accounts: ApiAccount[];
  transactions: ApiTransaction[];
  categories: ApiCategory[];
  goals: Array<{ id: string; name: string; targetCents: string; currentCents: string }>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TIMEOUT_MS = 15_000;

/**
 * Mensagem de erro da API.
 *
 * O Nest devolve `message` como **array** em erro de validação de DTO. O código
 * antigo fazia `String(array)`, que produzia `"a,b,c"` — texto sem sentido na
 * tela. Agora as mensagens são lidas uma a uma.
 */
export function errorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) {
      const parts = message.filter((item): item is string => typeof item === 'string');
      if (parts.length > 0) return parts.join(' ');
    }
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Não foi possível concluir a operação.';
}

export class ApiClient {
  private token: string | null = null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    // Barra no fim gera `//auth/login`, que alguns proxies tratam como 404.
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  get base(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    // Timeout explícito: sem isso, rede móvel instável deixa a tela em
    // "carregando" para sempre.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(init.headers ?? {}),
        },
      });

      if (response.status === 401) {
        this.options.onUnauthorized?.();
        throw new ApiError('Sessão encerrada. Entre novamente.', 401);
      }

      const text = await response.text();
      // Resposta não-JSON (proxy, 502 em HTML) não pode virar "sem conexão":
      // é erro do servidor e precisa aparecer com o status certo.
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          if (!response.ok) {
            throw new ApiError(
              `O servidor respondeu ${response.status}. Tente de novo.`,
              response.status
            );
          }
          throw new ApiError('Resposta inesperada do servidor.', response.status);
        }
      }

      if (!response.ok) {
        throw new ApiError(errorMessage(body), response.status);
      }

      return body as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('O servidor demorou para responder. Tente de novo.', 0);
      }
      throw new ApiError('Sem conexão com o servidor.', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const auth = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    // MFA pendente não devolve token: quem decide o próximo passo é a tela.
    if (auth.token) this.setToken(auth.token);
    return auth;
  }

  /** Melhor esforço: se falhar, o app já apagou o token local. */
  async logout(): Promise<void> {
    try {
      await this.request<{ revoked: boolean }>('/auth/logout', { method: 'POST' });
    } catch {
      /* ignorado de propósito */
    }
    this.setToken(null);
  }

  async status() {
    return this.request<{ authenticated: boolean; user: { id: string; name: string } }>(
      '/auth/status'
    );
  }

  async fetchSnapshot(): Promise<Snapshot> {
    const [accounts, transactions, categories, goals] = await Promise.all([
      this.request<ApiAccount[]>('/accounts'),
      this.request<ApiTransaction[]>('/transactions'),
      this.request<ApiCategory[]>('/categories'),
      // Metas são complementares: falhar aqui não pode derrubar a tela.
      this.request<Array<{ id: string; name: string; targetCents: string; currentCents: string }>>(
        '/financial-goals'
      ).catch(() => []),
    ]);
    return { accounts, transactions, categories, goals };
  }

  /**
   * Liquida um lançamento pendente (`POST /transactions/:id/settle`).
   * É o que permite o app fazer algo de verdade, não só ler.
   *
   * O método é `POST`, não `PATCH`: o controller da API expõe `@Post(':id/settle')`
   * e o Nest responde 405 para o método errado — o botão "Liquidar" do app
   * falhava em toda liquidação.
   */
  async settleTransaction(id: string, paidAt?: string): Promise<void> {
    await this.request(`/transactions/${id}/settle`, {
      method: 'POST',
      body: JSON.stringify(paidAt ? { paidAt } : {}),
    });
  }
}
