import {
  type ApiAccount,
  type ApiAvailableAccountsResponse,
  type ApiBankConnection,
  type ApiBudget,
  type ApiSharedAccount,
  type ApiSharingOverview,
  type ShareLevel,
  type ApiCategory,
  type ApiErrorBody,
  type ApiGoal,
  type ApiNetWorthItem,
  type ApiNetWorthSummary,
  type ApiGoalContribution,
  type ApiTransaction,
  type ApiUser,
  type AuthResponse,
  type AuthStatus,
  type ConnectConnectionDto,
  type CreateAccountDto,
  type CreateTransactionDto,
  type LinkAccountDto,
  type LoginDto,
  type MfaDisableResponse,
  type MfaEnableRequest,
  type MfaEnableResponse,
  type MfaQrCodeResponse,
  type MfaSecretResponse,
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
  ApiGoalContribution,
  ApiNetWorthItem,
  ApiNetWorthSummary,
  ApiBankConnection,
  ApiAvailableAccountsResponse,
  LinkAccountDto,
  ApiSharingOverview,
  ApiSharedAccount,
  ShareLevel,
  AuthResponse,
  AuthStatus,
  RegisterDto,
  LoginDto,
  CreateAccountDto,
  CreateTransactionDto,
  ConnectConnectionDto,
  MfaDisableResponse,
  MfaEnableRequest,
  MfaEnableResponse,
  MfaQrCodeResponse,
  MfaSecretResponse,
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
      // Erro de validação do Nest traz `message` como array de strings; o
      // `String(array)` antigo virava `"nome deve ser texto,valor inválido"` na
      // tela. Aqui as mensagens são concatenadas de forma legível.
      const raw = parsed.message as unknown;
      if (Array.isArray(raw)) {
        const parts = raw.filter((item): item is string => typeof item === 'string');
        if (parts.length > 0) message = parts.join(' ');
      } else if (typeof raw === 'string' && raw.trim()) {
        message = raw;
      }
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
const CSRF_COOKIE = 'mf_csrf';
const CSRF_HEADER = 'X-CSRF-Token';

/** Valor do cookie CSRF (legível pelo JS, ao contrário do cookie de sessão). */
function csrfFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * CSRF recebido no corpo de `/auth/login`, `/auth/mfa/verify` ou `/auth/status`.
 *
 * Em produção web e API ficam em domínios distintos: o cookie `mf_csrf` é
 * gravado no domínio da **API**, e `document.cookie` da página (domínio da web)
 * nunca o enxerga. Sem este valor, o cliente não monta o header e toda escrita
 * autenticada por cookie era recusada com 403 (era exatamente o erro ao criar
 * conta). Fica só em memória: nada de segredo de sessão em `localStorage`.
 */
let csrfFromResponse: string | null = null;

export function setCsrfToken(value: string | null | undefined): void {
  csrfFromResponse = value ?? null;
}

/** Valor CSRF disponível: o do cookie, quando legível, ou o vindo do servidor. */
function currentCsrfToken(): string | null {
  return csrfFromCookie() ?? csrfFromResponse;
}

/*
 * Por que o cliente NÃO tenta apagar o cookie de sessão aqui.
 *
 * `mf_session` é `HttpOnly` e pertence ao domínio da **API**, enquanto a página
 * roda em outro domínio: o `document.cookie` da web não alcança esse cookie nem
 * para ler nem para sobrescrever. Quem limpa é o servidor, respondendo
 * `Set-Cookie` de expiração no próprio domínio — feito em todo `401`
 * (`apps/api/src/common/all-exceptions.filter.ts`) e no logout.
 *
 * Registro do erro que isso causou: um cookie órfão sobreviveu ao reset do
 * banco, `GET /auth/status` devolvia `401` e o cookie continuava lá, então o
 * `POST /auth/register` chegava com ele e o `CsrfGuard` respondia `403`.
 * A correção definitiva é no servidor: rotas públicas levam `@SkipCsrf()`.
 */

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

  /** Remove o token do cliente e do localStorage (e o CSRF em memória). */
  clearToken(): void {
    this.setToken(null);
    setCsrfToken(null);
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

    // Sessão em cookie `HttpOnly` + double submit: o valor CSRF vem do cookie
    // legível e vai no header, que um site de terceiro não consegue montar.
    const csrf = currentCsrfToken();
    if (csrf && method !== 'GET' && method !== 'HEAD') {
      allHeaders[CSRF_HEADER] = csrf;
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: allHeaders,
        // Sem `include` o navegador não envia nem grava o cookie de sessão
        // quando a API está em outro domínio.
        credentials: 'include',
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
      if (err.isUnauthorized) {
        // O valor em memória não vale mais; o cookie é limpo pelo servidor (ver
        // o comentário acima — daqui não temos como apagá-lo).
        setCsrfToken(null);
        this.onUnauthorized?.();
      }
      throw err;
    }

    // 204/205 e corpo vazio não têm JSON: `res.json()` lançava e o app
    // mostrava "resposta inválida" em operações que deram certo (ex.: DELETE).
    if (res.status === 204 || res.status === 205) {
      return undefined as T;
    }

    const text = await res.text();
    if (!text) return undefined as T;

    try {
      return JSON.parse(text) as T;
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
    const result = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: dto,
    });
    // Guarda o CSRF da nova sessão antes de qualquer escrita.
    if (result.csrfToken) setCsrfToken(result.csrfToken);
    return result;
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

  /** Parceria, parceiro e nível de cada conta própria. */
  async getSharing(): Promise<ApiSharingOverview> {
    return this.request<ApiSharingOverview>('/sharing');
  }

  /** Contas que o parceiro compartilhou (saldo e/ou histórico). */
  async getSharedAccounts(): Promise<ApiSharedAccount[]> {
    return this.request<ApiSharedAccount[]>('/sharing/accounts');
  }

  async setShareLevel(accountId: string, level: ShareLevel): Promise<unknown> {
    return this.request<unknown>(`/sharing/accounts/${accountId}`, {
      method: 'PATCH',
      body: { level },
    });
  }

  async invitePartner(email: string): Promise<unknown> {
    return this.request<unknown>('/sharing/invite', { method: 'POST', body: { email } });
  }

  async acceptPartnership(partnershipId?: string): Promise<unknown> {
    return this.request<unknown>('/sharing/accept', {
      method: 'POST',
      body: partnershipId ? { partnershipId } : {},
    });
  }

  async revokePartnership(): Promise<unknown> {
    return this.request<unknown>('/sharing', { method: 'DELETE' });
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

  /* Patrimônio — bens e dívidas declarados à mão */

  async getNetWorth(): Promise<ApiNetWorthSummary> {
    return this.request<ApiNetWorthSummary>('/net-worth');
  }

  async createNetWorthItem(dto: {
    name: string;
    kind: 'asset' | 'liability';
    valueCents: string;
    note?: string;
  }): Promise<ApiNetWorthItem> {
    return this.request<ApiNetWorthItem>('/net-worth/items', { method: 'POST', body: dto });
  }

  async updateNetWorthItem(
    id: string,
    dto: { name?: string; kind?: 'asset' | 'liability'; valueCents?: string; note?: string }
  ): Promise<{ id: string; updated: true }> {
    return this.request<{ id: string; updated: true }>(`/net-worth/items/${id}`, {
      method: 'PATCH',
      body: dto,
    });
  }

  async deleteNetWorthItem(id: string): Promise<{ deleted: number }> {
    return this.request<{ deleted: number }>(`/net-worth/items/${id}`, { method: 'DELETE' });
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

  /** Aportes da meta: é o histórico que explica o saldo atual. */
  async getGoalContributions(id: string): Promise<ApiGoalContribution[]> {
    return this.request<ApiGoalContribution[]>(`/financial-goals/${id}/contributions`);
  }

  async addGoalContribution(
    id: string,
    dto: { amountCents: string; note?: string; occurredAt?: string }
  ): Promise<ApiGoal> {
    return this.request<ApiGoal>(`/financial-goals/${id}/contributions`, {
      method: 'POST',
      body: dto,
    });
  }

  async removeGoalContribution(id: string, contributionId: string): Promise<ApiGoal> {
    return this.request<ApiGoal>(`/financial-goals/${id}/contributions/${contributionId}`, {
      method: 'DELETE',
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

  /**
   * Exclui a conta. Exige a senha: a ação apaga todo o histórico financeiro e
   * sessão sozinha não prova que o dono está ali agora.
   */
  async deleteAccount(password: string): Promise<void> {
    return this.request<void>('/auth/account', {
      method: 'DELETE',
      body: { password },
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

  /** Contas da instituição disponíveis para vincular (Open Finance). */
  async getAvailableAccounts(): Promise<ApiAvailableAccountsResponse> {
    return this.request<ApiAvailableAccountsResponse>('/open-finance/available-accounts');
  }

  /**
   * Cria a conta a partir do provedor e a deixa vinculada.
   *
   * É o caminho "de verdade" para conta bancária: nome, instituição, tipo e
   * saldo vêm da instituição. `POST /accounts` fica para conta manual.
   */
  async linkAccount(dto: LinkAccountDto): Promise<{
    account: { id: string; name: string };
    connectionId: string;
    synced: boolean;
  }> {
    return this.request('/open-finance/link-account', { method: 'POST', body: dto });
  }

  /**
   * Token de curta duração para abrir o widget de consentimento do Open Finance.
   *
   * O `clientSecret` do agregador fica no servidor; o navegador recebe só este
   * token (30 min). É aqui que o usuário autoriza o banco — sem isso não existe
   * vínculo real, só sandbox.
   */
  async getConnectToken(): Promise<{ provider: string; accessToken: string; widgetUrl: string }> {
    return this.request('/open-finance/connect-token', { method: 'POST' });
  }

  /**
   * Registra o item devolvido pelo widget e importa as contas dele.
   *
   * O corpo leva apenas o `itemId`; saldo, tipo e nome vêm do provedor.
   */
  async connectItem(itemId: string): Promise<{
    itemId: string;
    status: string;
    accounts: number;
    created: number;
    synced: boolean;
  }> {
    return this.request('/open-finance/connect-item', { method: 'POST', body: { itemId } });
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

  /**
   * QR code do segredo **pendente** (gerado antes por `mfaNewSecret`).
   *
   * Não recebe segredo: ele não trafega por query string (URL fica em log de
   * acesso, histórico e cache de proxy).
   */
  async mfaQrCode(): Promise<MfaQrCodeResponse> {
    return this.request<MfaQrCodeResponse>('/auth/mfa/qr-code');
  }

  /** Gera um segredo novo no servidor (o QR code vem de `mfaQrCode`). */
  async mfaNewSecret(): Promise<MfaSecretResponse> {
    return this.request<MfaSecretResponse>('/auth/mfa/secret');
  }

  async mfaEnable(dto: MfaEnableRequest): Promise<MfaEnableResponse> {
    return this.request<MfaEnableResponse>('/auth/mfa/enable', {
      method: 'POST',
      body: dto,
    });
  }

  /** Verifica o código TOTP com o token temporário de sessão MFA (não usa o token JWT armazenado). */
  async mfaVerify(dto: MfaVerifyRequest, sessionToken: string): Promise<AuthResponse> {
    const result = await this.request<AuthResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: dto,
      token: sessionToken,
    });
    if (result.csrfToken) setCsrfToken(result.csrfToken);
    return result;
  }

  /** Encerra a sessão no servidor (o JWT deixa de valer imediatamente). */
  async logout(): Promise<{ revoked: boolean }> {
    return this.request<{ revoked: boolean }>('/auth/logout', { method: 'POST' });
  }

  /** Encerra todas as sessões do usuário, inclusive a atual. */
  async logoutAll(): Promise<{ revoked: number; sessions: number }> {
    return this.request<{ revoked: number; sessions: number }>('/auth/logout-all', {
      method: 'POST',
    });
  }

  /** Valida a sessão no servidor e devolve o usuário atual. */
  async authStatus(): Promise<AuthStatus> {
    const status = await this.request<AuthStatus>('/auth/status');
    // Recupera o CSRF ao abrir/recarregar o app: é o que mantém a escrita
    // funcionando quando o cookie não é legível (domínios diferentes).
    if (status.csrfToken) setCsrfToken(status.csrfToken);
    return status;
  }

  /** Desliga o MFA — exige o código atual do app autenticador. */
  async mfaDisable(dto: MfaVerifyRequest): Promise<MfaDisableResponse> {
    return this.request<MfaDisableResponse>('/auth/mfa/disable', {
      method: 'POST',
      body: dto,
    });
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
