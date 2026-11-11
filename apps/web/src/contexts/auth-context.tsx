'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { api, ApiError, type ApiUser } from '../lib/api';
import { useRouter } from 'next/navigation';
import { LOCAL_STORAGE_KEYS } from '@meufinanceiro/shared-types';

type AuthContextType = {
  user: ApiUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  hideValues: boolean;
  setHideValues: (value: boolean) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hideValues, setHideValues] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEYS.token) : null;
    const storedUser = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEYS.user) : null;
    const storedHide = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEYS.hideValues) : null;

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
    setIsLoading(false);
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
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

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login({ email, password });
    setToken(result.token);
    setUser(result.user);
    api.setToken(result.token);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEYS.token, result.token);
      localStorage.setItem(LOCAL_STORAGE_KEYS.user, JSON.stringify(result.user));
    }
    router.push('/');
  }, [router]);

  const register = useCallback(async (email: string, name: string, password: string) => {
    // Cadastro não retorna token (backend devolve apenas o usuário): faz login automático.
    await api.register({ email, name, password });
    await login(email, password);
  }, [login]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    api.setToken(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.token);
      localStorage.removeItem(LOCAL_STORAGE_KEYS.user);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, hideValues, setHideValues }}>
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
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Erro desconhecido';
}
