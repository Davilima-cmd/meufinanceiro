'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'; /* eslint-disable react-hooks/set-state-in-effect */
import { api, ApiError, type ApiUser, type MfaEnableResponse } from '../lib/api';
import { useRouter } from 'next/navigation';
import { LOCAL_STORAGE_KEYS } from '@meufinanceiro/shared-types';

type AuthContextType = {
  user: ApiUser | null;
  token: string | null;
  isLoading: boolean;
  /** JWT temporário (5 min) emitido quando o login exige MFA. Usado somente em /auth/mfa/verify. */
  mfaTempToken: string | null;
  /** ID do usuário pendente de verificação de MFA (o backend não devolve o objeto completo no login com MFA). */
  mfaUserId: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  /** Confirma o código TOTP e troca o token temporário pelo JWT completo. */
  mfaVerify: (code: string) => Promise<void>;
  /** Confirma o segredo TOTP e ativa o MFA do usuário logado. */
  mfaEnable: (secret: string, token: string) => Promise<MfaEnableResponse>;
  mfaDisable: () => Promise<void>;
  hideValues: boolean;
  setHideValues: (value: boolean) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Sessão temporária de MFA (5 min) mantida somente durante a aba do navegador,
 * para que um recarregamento em /auth/mfa-verify não derrube o fluxo de verificação. */
const MFA_SESSION_KEYS = {
  tempToken: 'mf_mfa_temp_token',
  userId: 'mf_mfa_user_id',
} as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mfaTempToken, setMfaTempToken] = useState<string | null>(null);
  const [mfaUserId, setMfaUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hideValues, setHideValues] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEYS.token) : null;
    const storedUser =
      typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEYS.user) : null;
    const storedHide =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(LOCAL_STORAGE_KEYS.hideValues)
        : null;
    const storedMfaToken =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(MFA_SESSION_KEYS.tempToken)
        : null;
    const storedMfaUserId =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(MFA_SESSION_KEYS.userId)
        : null;

    if (stored) {
      setToken(stored);
      api.setToken(stored);
    }
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    if (storedHide !== null) {
      setHideValues(storedHide === 'true');
    }
    if (storedMfaToken) {
      setMfaTempToken(storedMfaToken);
    }
    if (storedMfaUserId) {
      setMfaUserId(storedMfaUserId);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
      setMfaTempToken(null);
      setMfaUserId(null);
      api.clearToken();
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_KEYS.token);
        localStorage.removeItem(LOCAL_STORAGE_KEYS.user);
      }
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        router.replace('/login');
      }
    });
  }, [router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.login({ email, password });
      // MFA obrigatória: não libera o app ainda. Completa em /auth/mfa-verify com o token temporário.
      if (result.mfaRequired && result.tempToken && result.userId) {
        setMfaTempToken(result.tempToken ?? null);
        setMfaUserId(result.userId ?? null);
        if (typeof sessionStorage !== 'undefined') {
          if (result.tempToken) {
            sessionStorage.setItem(MFA_SESSION_KEYS.tempToken, result.tempToken);
          } else {
            sessionStorage.removeItem(MFA_SESSION_KEYS.tempToken);
          }
          if (result.userId) {
            sessionStorage.setItem(MFA_SESSION_KEYS.userId, result.userId);
          } else {
            sessionStorage.removeItem(MFA_SESSION_KEYS.userId);
          }
        }
        router.push('/auth/mfa-verify');
        return;
      }
      setToken(result.token ?? null);
      setUser(result.user ?? null);
      api.setToken(result.token ?? null);
      if (typeof localStorage !== 'undefined') {
        if (result.token) {
          localStorage.setItem(LOCAL_STORAGE_KEYS.token, result.token);
        } else {
          localStorage.removeItem(LOCAL_STORAGE_KEYS.token);
        }
        if (result.user) {
          localStorage.setItem(LOCAL_STORAGE_KEYS.user, JSON.stringify(result.user));
        } else {
          localStorage.removeItem(LOCAL_STORAGE_KEYS.user);
        }
      }
      router.push('/');
    },
    [router]
  );

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      // Cadastro não retorna token (backend devolve apenas o usuário): faz login automático.
      await api.register({ email, name, password });
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setMfaTempToken(null);
    setMfaUserId(null);
    api.setToken(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.token);
      localStorage.removeItem(LOCAL_STORAGE_KEYS.user);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(MFA_SESSION_KEYS.tempToken);
      sessionStorage.removeItem(MFA_SESSION_KEYS.userId);
    }
    router.push('/login');
  }, [router]);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    logout();
  }, [logout]);

  /** Persiste o usuário no localStorage (sem segredos TOTP) e mantém o contexto sincronizado. */
  const persistUser = useCallback((next: ApiUser | null) => {
    setUser(next);
    if (typeof localStorage !== 'undefined') {
      if (next) localStorage.setItem(LOCAL_STORAGE_KEYS.user, JSON.stringify(next));
      else localStorage.removeItem(LOCAL_STORAGE_KEYS.user);
    }
  }, []);

  const mfaVerify = useCallback(
    async (code: string) => {
      const session = mfaTempToken;
      const userId = mfaUserId;
      if (!session || !userId) {
        throw new Error('Sessão MFA expirada. Faça login novamente.');
      }
      const result = await api.mfaVerify({ code }, session);
      setMfaTempToken(null);
      setMfaUserId(null);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(MFA_SESSION_KEYS.tempToken);
        sessionStorage.removeItem(MFA_SESSION_KEYS.userId);
      }
      setToken(result.token ?? null);
      // O endpoint de verificação devolve apenas o JWT; o objeto do usuário não vem na resposta.
      // Mantém um usuário parcial para não quebrar a sessão ao recarregar a página.
      const partialUser: ApiUser = {
        id: userId,
        email: '',
        name: '',
        createdAt: '',
        updatedAt: '',
      };
      persistUser(partialUser);
      api.setToken(result.token ?? null);
      if (typeof localStorage !== 'undefined' && result.token) {
        localStorage.setItem(LOCAL_STORAGE_KEYS.token, result.token);
      }
      router.push('/');
    },
    [mfaTempToken, mfaUserId, persistUser, router]
  );

  const mfaEnable = useCallback(
    async (secret: string, token: string) => {
      const result = await api.mfaEnable({ secret, token });
      persistUser(result.user);
      return result;
    },
    [persistUser]
  );

  const mfaDisable = useCallback(async () => {
    const result = await api.mfaDisable();
    persistUser(result.user);
  }, [persistUser]);
  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        mfaTempToken,
        mfaUserId,
        login,
        register,
        logout,
        deleteAccount,
        mfaVerify,
        mfaEnable,
        mfaDisable,
        hideValues,
        setHideValues,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

/** Extrai mensagem legível de um erro da API, com fallback seguro. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isForbidden) return 'Você não tem permissão para realizar esta ação.';
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Erro desconhecido';
}
