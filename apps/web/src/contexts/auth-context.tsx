'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { api, type ApiUser } from '../lib/api';

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

  useEffect(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('mf_token') : null;
    const storedUser = typeof localStorage !== 'undefined' ? localStorage.getItem('mf_user') : null;
    const storedHide = typeof localStorage !== 'undefined' ? localStorage.getItem('mf_hide_values') : null;

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

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login({ email, password });
    setToken(result.token);
    setUser(result.user);
    api.setToken(result.token);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mf_token', result.token);
      localStorage.setItem('mf_user', JSON.stringify(result.user));
    }
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    const result = await api.register({ email, name, password });
    setToken(result.token);
    setUser(result.user);
    api.setToken(result.token);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mf_token', result.token);
      localStorage.setItem('mf_user', JSON.stringify(result.user));
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    api.setToken(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('mf_token');
      localStorage.removeItem('mf_user');
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
