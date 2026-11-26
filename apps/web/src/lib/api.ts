import {
  type ApiAccount,
  type ApiBankConnection,
  type ApiBudget,
  type ApiCategory,
  type ApiErrorBody,
  type ApiGoal,
  type ApiTransaction,
  type ApiUser,
  type AuthResponse,
  type ConnectConnectionDto,
  type CreateAccountDto,
  type CreateTransactionDto,
  type LoginDto,
  type MfaDisableResponse,
  type MfaEnableRequest,
  type MfaEnableResponse,
  type MfaQrCodeResponse,
  type MfaVerifyRequest,
  type RegisterDto,
  type TriggerSyncResponse,
  LOCAL_STORAGE_KEYS,
} from '@meufinanceiro/shared-types';

export type {
  ApiUser,
  ApiAccount,
  ApiTransaction,
  ApiCategory,
  ApiBudget,
  ApiGoal,
  ApiBankConnection,
  AuthResponse,
  RegisterDto,
  LoginDto,
  CreateAccountDto,
  CreateTransactionDto,
  ConnectConnectionDto,
  MfaDisableResponse,
  MfaEnableRequest,
  MfaEnableResponse,
  MfaQrCodeResponse,
  MfaVerifyRequest,
  BankConnectionStatus,
  SyncJob,
  TriggerSyncResponse,
  ApiErrorBody,
} from '@meufinanceiro/shared-types';
export { LOCAL_STORAGE_KEYS } from '@meufinanceiro/shared-types';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api';

/** Erro padronizado retornado pela API (corpo do NestJS: { message, error, statusCode }). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly isClientError: boolean;
  readonly isServerError: boolean;
  readonly isUnauthorized: boolean;
  readonly isForbidden: boolean;
  readonly isNotFound: boolean;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.isClientError = status >= 400 && status < 500;
    this.isServerError = status >= 500;
    this.isUnauthorized = status === 401;
    this.isForbidden = status === 403;
    this.isNotFound = status === 404;
  }

  static fromResponse(status: number, body: unknown): ApiError {
    let message = `API ${status}`;
    let code = `ERR_${status}`;
    if (body && typeof body === 'object') {
      const parsed = body as Partial<ApiErrorBody>;
      if (parsed.message) message = String(parsed.message);
      if (parsed.error) code = String(parsed.error);
    }
    return new ApiError(message, status, code);
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Token bearer a ser usado nesta requisição, em vez do armazenado (ex.: token temporário de sessão MFA). */
  token?: string;
};

/** Cliente de API com interceptor automático de bearer token. O token é lido do
 * localStorage a cada requisição, então não depende de hidratação prévia do contexto. */
class ApiClient {
  private onUnauthorized?: () => void;

  private tokenFromStorage(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(LOCAL_STORAGE_KEYS.token);
  }

  /** Define um handler global executado sempre que a API responde 401. */
  setUnauthorizedHandler(handler: () => void): void {
    this.onUnauthorized = handler;
  }

  /** Define o token manualmente (usa-se após login/cadastro). */
  setToken(token: string | null): void {
    if (typeof localStorage === 'undefined') return;
    if (token) localStorage.setItem(LOCAL_STORAGE_KEYS.token, token);
    else localStorage.removeItem(LOCAL_STORAGE_KEYS.token);
  }

  /** Remove o token do cliente e do localStorage. */
  clearToken(): void {
    this.setToken(null);
  }

  private async request<T>(
    path: string,
    { method = 'GET', body, headers = {}, token: optToken }: RequestOptions = {}
  ): Promise<T> {
    const token = optToken ?? this.tokenFromStorage();
    const allHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (token) {
      allHeaders['Authorization'] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: allHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError(
        err instanceof Error ? err.message : 'Erro de rede ao chamar a API',
        0,
        'ERR_NETWORK'
      );
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as unknown;
      const err = ApiError.fromResponse(res.status, body);
      if (err.isUnauthorized && this.onUnauthorized) {
        this.onUnauthorized();
      }
      throw err;
    }

    if (res.status === 204) {
      return undefined as T;
    }

    try {
      return (await res.json()) as T;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      throw new ApiError(
        'Resposta da API não pôde ser interpretada (JSON inválido)',
        res.status,
        'ERR_INVALID_RESPONSE'
      );
    }
  }

  async register(dto: RegisterDto): Promise<ApiUser> {
    return this.request<ApiUser>('/auth/register', {
      method: 'POST',
      body: dto,
    });
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: dto,
    });
  }

  async getAccounts(): Promise<ApiAccount[]> {
    return this.request<ApiAccount[]>('/accounts');
  }

  async createAccount(dto: CreateAccountDto): Promise<ApiAccount> {
    return this.request<ApiAccount>('/accounts', {
      method: 'POST',
      body: dto,
    });
  }

  async removeAccount(id: string): Promise<void> {
    await this.request<void>(`/accounts/${id}`, { method: 'DELETE' });
  }

  async getTransactions(): Promise<ApiTransaction[]> {
    return this.request<ApiTransaction[]>('/transactions');
  }

  async createTransaction(dto: CreateTransactionDto): Promise<ApiTransaction> {
    return this.request<ApiTransaction>('/transactions', {
      method: 'POST',
      body: dto,
    });
  }

  async settleTransaction(id: string, paidAt?: string): Promise<ApiTransaction> {
    return this.request<ApiTransaction>(`/transactions/${id}/settle`, {
      method: 'POST',
      body: paidAt ? { paidAt } : {},
    });
  }

  async cancelTransaction(id: string): Promise<ApiTransaction> {
    return this.request<ApiTransaction>(`/transactions/${id}/cancel`, { method: 'POST' });
  }

  async deleteTransaction(id: string): Promise<{ deleted: number }> {
    return this.request<{ deleted: number }>(`/transactions/${id}`, { method: 'DELETE' });
  }

  async getCategories(): Promise<ApiCategory[]> {
    return this.request<ApiCategory[]>('/categories');
  }

  async createCategory(dto: { name: string; color?: string }): Promise<ApiCategory> {
    return this.request<ApiCategory>('/categories', {
      method: 'POST',
      body: dto,
    });
  }

  async updateCategory(id: string, dto: { name?: string; color?: string }): Promise<ApiCategory> {
    return this.request<ApiCategory>(`/categories/${id}`, {
      method: 'PATCH',
      body: dto,
    });
  }

  async deleteCategory(id: string) {
    return this.request<{ id: string }>(`/categories/${id}`, {
      method: 'DELETE',
    });
  }

  async getBudgets(): Promise<ApiBudget[]> {
    return this.request<ApiBudget[]>('/budgets');
  }

  async createBudget(dto: {
    categoryId: string;
    amountCents: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<ApiBudget> {
    return this.request<ApiBudget>('/budgets', {
      method: 'POST',
      body: dto,
    });
  }

  async updateBudget(
    id: string,
    dto: { amountCents?: string; periodStart?: string; periodEnd?: string }
  ): Promise<ApiBudget> {
    return this.request<ApiBudget>(`/budgets/${id}`, {
      method: 'PATCH',
      body: dto,
    });
  }

  async deleteBudget(id: string) {
    return this.request<{ id: string }>(`/budgets/${id}`, {
      method: 'DELETE',
    });
  }

  async getGoals(): Promise<ApiGoal[]> {
    return this.request<ApiGoal[]>('/financial-goals');
  }

  async createGoal(dto: {
    name: string;
    targetCents: string;
    currentCents?: string;
    dueDate?: string;
  }): Promise<ApiGoal> {
    return this.request<ApiGoal>('/financial-goals', {
      method: 'POST',
      body: dto,
    });
  }

  async updateGoal(
    id: string,
    dto: { name?: string; targetCents?: string; currentCents?: string; dueDate?: string }
  ): Promise<ApiGoal> {
    return this.request<ApiGoal>(`/financial-goals/${id}`, {
      method: 'PATCH',
      body: dto,
    });
  }

  async deleteGoal(id: string) {
    return this.request<{ id: string }>(`/financial-goals/${id}`, {
      method: 'DELETE',
    });
  }

  async forgotPassword(email: string): Promise<{ requested: true }> {
    return this.request<{ requested: true }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  }

  async resetPassword(token: string, password: string): Promise<{ reset: true }> {
    return this.request<{ reset: true }>('/auth/reset-password', {
      method: 'POST',
      body: { token, password },
    });
  }

  async deleteAccount(): Promise<void> {
    return this.request<void>('/auth/account', {
      method: 'DELETE',
    });
  }

  /* Open Finance — conexões com instituições (sandbox) */

  async getConnections(): Promise<ApiBankConnection[]> {
    return this.request<ApiBankConnection[]>('/open-finance/connections');
  }

  async connectConnection(dto: ConnectConnectionDto): Promise<ApiBankConnection> {
    return this.request<ApiBankConnection>('/open-finance/connections', {
      method: 'POST',
      body: dto,
    });
  }

  async revokeConnection(id: string): Promise<ApiBankConnection> {
    return this.request<ApiBankConnection>(`/open-finance/connections/${id}/revoke`, {
      method: 'PATCH',
    });
  }

  /* Reconciliação — dispara sincronização de transações das conexões */

  async triggerSync(): Promise<TriggerSyncResponse> {
    return this.request<TriggerSyncResponse>('/open-finance/sync', {
      method: 'POST',
    });
  }

  /* MFA — autenticação de dois fatores (TOTP) */

  async mfaQrCode(secret: string): Promise<MfaQrCodeResponse> {
    return this.request<MfaQrCodeResponse>(
      `/auth/mfa/qr-code?secret=${encodeURIComponent(secret)}`
    );
  }

  async mfaEnable(dto: MfaEnableRequest): Promise<MfaEnableResponse> {
    return this.request<MfaEnableResponse>('/auth/mfa/enable', {
      method: 'POST',
      body: dto,
    });
  }

  /** Verifica o código TOTP com o token temporário de sessão MFA (não usa o token JWT armazenado). */
  async mfaVerify(dto: MfaVerifyRequest, sessionToken: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: dto,
      token: sessionToken,
    });
  }

  async mfaDisable(): Promise<MfaDisableResponse> {
    return this.request<MfaDisableResponse>('/auth/mfa/disable', { method: 'POST' });
  }
}

export const api = new ApiClient();

/** Envolve uma promessa com limite de tempo, para não travar a interface quando a API não responde. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout de ${ms}ms ao chamar a API`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

/** `true` quando existe uma base de API configurada em tempo de build. */
export function hasConfiguredApi(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_API_BASE);
}
