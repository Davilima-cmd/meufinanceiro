import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient, type Snapshot } from './api';

/**
 * Estado de dados do app quando ele está conectado à API.
 *
 * O app mantém o modo demonstração (sem rede, útil em apresentação), mas
 * quando há `EXPO_PUBLIC_API_URL` ele tenta a API de verdade: login com Bearer,
 * snapshot real e a ação de liquidar um lançamento pendente.
 *
 * A regra de ouro aqui é: **nunca inventar dado**. Se a API falhar, a tela
 * mostra o erro; não preenche com números fictícios fingindo que são reais.
 */

export type ApiState = {
  mode: 'demo' | 'api';
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
  user: { id: string; name: string } | null;
};

export function apiBaseUrl(): string | null {
  // Expo injeta EXPO_PUBLIC_* no bundle; sem ela, o app fica em modo demo.
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  return value ? value.replace(/\/+$/, '') : null;
}

export function createClient(onUnauthorized?: () => void): ApiClient | null {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) return null;
  return new ApiClient({ baseUrl, onUnauthorized });
}

export function useFinanceApi(token: string | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  // O cliente é recriado só quando o token muda: cada instância guarda o token.
  const client = useMemo(() => {
    const instance = createClient(() => {
      setExpired(true);
      setSnapshot(null);
    });
    instance?.setToken(token);
    return instance;
  }, [token]);

  const reload = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await client.fetchSnapshot());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Falha ao carregar os dados.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!token || !client) return;
    // Carregar dados de uma fonte externa (a API) é exatamente o caso de uso de
    // um efeito; o `setState` que a regra enxerga é o `loading`, não um render
    // em cascata.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [token, client, reload]);

  /** Liquida um pendente e recarrega — o saldo é do servidor, não uma soma local. */
  const settle = useCallback(
    async (id: string) => {
      if (!client) return 'Este app está no modo demonstração.';
      try {
        await client.settleTransaction(id);
        await reload();
        return null;
      } catch (failure) {
        return failure instanceof Error ? failure.message : 'Não foi possível liquidar.';
      }
    },
    [client, reload]
  );

  return {
    mode: client ? ('api' as const) : ('demo' as const),
    snapshot,
    loading,
    error,
    expired,
    reload,
    settle,
  };
}
