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
  createdAt: string;
  updatedAt: string;
};

/** Resposta de autenticação (cadastro ou login). */
export type AuthResponse = {
  user: ApiUser;
  token: string;
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
export type ApiAccount = {
  id: string;
  name: string;
  institution?: string | null;
  type: string;
  currency: string;
  balanceCents: string;
  isActive: boolean;
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
  userId: string;
  categoryId?: string | null;
  description: string;
  amountCents: string;
  type: string;
  origin: string;
  providerId?: string | null;
  date: string;
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
  date: string;
};

/** Erro padronizado da API (corpo do NestJS: { message, error, statusCode }). */
export type ApiErrorBody = {
  message: string;
  error: string;
  statusCode: number;
};

/** Chaves de armazenamento local usadas pelo cliente da API e pelo contexto de auth. */
export const LOCAL_STORAGE_KEYS = {
  token: 'mf_token',
  user: 'mf_user',
  hideValues: 'mf_hide_values',
} as const;

export { formatCents } from './format-money.js';
