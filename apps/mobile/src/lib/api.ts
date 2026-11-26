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
      const body = text ? (JSON.parse(text) as unknown) : null;

      if (!response.ok) {
        const message =
          body && typeof body === 'object' && 'message' in body
            ? String((body as { message: unknown }).message)
            : 'Não foi possível concluir a operação.';
        throw new ApiError(message, response.status);
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
   * Liquida um lançamento pendente (`PATCH /transactions/:id/settle`).
   * É o que permite o app fazer algo de verdade, não só ler.
   */
  async settleTransaction(id: string, paidAt?: string): Promise<void> {
    await this.request(`/transactions/${id}/settle`, {
      method: 'PATCH',
      body: JSON.stringify(paidAt ? { paidAt } : {}),
    });
  }
}
