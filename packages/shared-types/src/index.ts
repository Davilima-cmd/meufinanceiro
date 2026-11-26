export const ACCOUNT_SHARE_LEVELS = ['BALANCE_ONLY', 'FULL'] as const;

export type AccountShareLevel = (typeof ACCOUNT_SHARE_LEVELS)[number];
export type MoneyCents = bigint;
export type UtcIsoDate = string;

/** Contratos compartilhados entre frontend e backend da API. */

/** Usuário retornado por cadastro/login e pelo contexto de autenticação. */
export type ApiUser = {
  id: string;
  email: string;
  name: string;
  mfaEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Resposta de autenticação (cadastro ou login). */
export type AuthResponse = {
  user?: ApiUser;
  token?: string;
  /** Quando verdadeiro, o usuário tem MFA obrigatória e deve completar POST /auth/mfa/verify antes de acessar o app. */
  mfaRequired?: boolean;
  /** ID do usuário quando MFA é obrigatória (o objeto completo não vem nesta resposta). */
  userId?: string;
  /**
   * JWT temporário (5 min) emitido quando MFA é obrigatória. Serve apenas para
   * confirmar o código TOTP em POST /auth/mfa/verify. É mantido somente em
   * memória — nunca é um segredo TOTP e nunca é gravado no localStorage.
   */
  tempToken?: string;
};

/** DTO de ativação do MFA: segredo base32 + código TOTP de confirmação. */
export type MfaEnableRequest = { secret: string; token: string };

/** Resposta de ativação do MFA. */
export type MfaEnableResponse = { mfaEnabled: boolean; user: ApiUser };

/** Resposta de desativação do MFA. */
export type MfaDisableResponse = { mfaEnabled: boolean; user: ApiUser };

/** DTO de verificação de código TOTP (segundo fator no login). */
export type MfaVerifyRequest = { code: string };

/** Resposta da geração do QR code de configuração do MFA. */
export type MfaQrCodeResponse = {
  /** URL otpauth://totp/... a ser lida pelo app autenticador (Google Authenticator etc.). */
  otpAuthUrl: string;
  /** Imagem do QR code em data URL, quando gerada pelo servidor. */
  qrCode?: string;
};

/** DTO de entrada de cadastro. */
export type RegisterDto = {
  email: string;
  name: string;
  password: string;
};

/** DTO de entrada de login. */
export type LoginDto = {
  email: string;
  password: string;
};

/** Conta financeira retornada pela API (valores em centavos como string). */
/** Níveis de compartilhamento de uma conta, do mais restrito ao mais aberto. */
export type ShareLevel = 'private' | 'BALANCE_ONLY' | 'FULL';

/**
 * O que o usuário pode fazer numa conta. Conta que não é dele vem sempre
 * `readOnly`; `BALANCE_ONLY` não mostra histórico.
 */
export type AccountAccess = {
  canSeeBalance: boolean;
  canSeeTransactions: boolean;
  readOnly: boolean;
};

export type ApiAccount = {
  id: string;
  name: string;
  institution?: string | null;
  type: string;
  currency: string;
  balanceCents: string;
  isActive: boolean;
  /** Dono da conta (pode ser o parceiro, em conta compartilhada). */
  ownerId?: string;
  ownerName?: string | null;
  shareLevel?: ShareLevel;
  access?: AccountAccess;
  createdAt: string;
  updatedAt: string;
};

/** DTO de entrada para criar uma conta. */
export type CreateAccountDto = {
  name: string;
  institution?: string;
  type?: string;
  currency?: string;
};

/** Lançamento financeiro retornado pela API. */
export type ApiTransaction = {
  id: string;
  accountId: string;
  transferId?: string | null;
  userId: string;
  categoryId?: string | null;
  description: string;
  amountCents: string;
  type: string;
  origin: string;
  providerId?: string | null;
  /** Data de caixa (quando o dinheiro entrou/saiu). */
  date: string;
  /** Data de competência: o mês a que o lançamento pertence. */
  competenceDate: string;
  /** `pending` (a pagar/receber), `paid` (liquidado) ou `canceled`. */
  status: 'pending' | 'paid' | 'canceled';
  /** Momento da liquidação; nulo enquanto pendente. */
  paidAt?: string | null;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Categoria financeira retornada pela API. */
export type ApiCategory = {
  id: string;
  userId: string | null;
  name: string;
  color: string;
  isSystem: boolean;
  createdAt: string;
};

/** Orçamento retornado pela API. */
export type ApiBudget = {
  id: string;
  categoryId: string;
  amountCents: string;
  periodStart: string;
  periodEnd: string;
  spentCents: string;
  remainingCents: string;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; color: string };
};

/** Meta financeira retornada pela API. */
export type ApiGoal = {
  id: string;
  userId: string;
  name: string;
  targetCents: string;
  currentCents: string;
  dueDate: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
};

/** DTO de entrada para criar um lançamento. */
export type CreateTransactionDto = {
  accountId: string;
  description: string;
  amountCents: string;
  type: string;
  categoryId?: string;
  /** Só para `type: 'transfer'`: conta que recebe o valor. */
  transferAccountId?: string;
  /** Data de caixa. */
  date: string;
  /** Data de competência; sem ela, usa `date`. */
  competenceDate?: string;
  /** `pending` (padrão) ou `paid`. Transferências são sempre liquidadas. */
  status?: 'pending' | 'paid' | 'canceled';
  /** Vencimento, para contas a pagar/receber. */
  dueDate?: string;
};

/** Erro padronizado da API (corpo do NestJS: { message, error, statusCode }). */
export type ApiErrorBody = {
  message: string;
  error: string;
  statusCode: number;
};

/** Status de uma conexão Open Finance (banco de dados: active, awaiting_authorization, expired, error, disconnected). */
export type BankConnectionStatus =
  'active' | 'awaiting_authorization' | 'expired' | 'error' | 'disconnected';

/** Conexão de Open Finance retornada pela API. */
export type ApiBankConnection = {
  id: string;
  provider: string;
  providerAccountId: string;
  status: BankConnectionStatus;
  consentId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; name: string };
};

/** DTO de entrada para conectar uma instituição via sandbox. */
export type ConnectConnectionDto = {
  provider: string;
  providerAccountId: string;
  accountId: string;
};

/** Job de sincronização/reconciliação retornado por POST /open-finance/sync. */
export type SyncJob = {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
};

/** Resposta de disparo de sincronização. */
export type TriggerSyncResponse = { id: string; status: string };

/** Chaves de armazenamento local usadas pelo cliente da API e pelo contexto de auth. */
export const LOCAL_STORAGE_KEYS = {
  token: 'mf_token',
  user: 'mf_user',
  hideValues: 'mf_hide_values',
} as const;

export { formatCents, formatBRL } from './format-money.js';

/** Parceria entre duas pessoas: quem convidou, quem recebeu e a situação. */
export type ApiPartnership = {
  id: string;
  status: 'pending' | 'accepted' | 'revoked';
  invitedByMe: boolean;
  partnerId: string | null;
};

export type ApiSharingOverview = {
  partnership: ApiPartnership | null;
  partner: { id: string; name: string } | null;
  accounts: Array<{ id: string; name: string; balanceCents: string; level: ShareLevel }>;
  levels: ShareLevel[];
};

/** Conta que o parceiro compartilhou, já com o que o usuário pode ver. */
export type ApiSharedAccount = {
  account: {
    id: string;
    name: string;
    institution?: string | null;
    balanceCents: string;
    isActive: boolean;
  };
  owner: { id: string; name: string };
  level: ShareLevel;
  canSeeBalance: boolean;
  canSeeTransactions: boolean;
  readOnly: boolean;
};
