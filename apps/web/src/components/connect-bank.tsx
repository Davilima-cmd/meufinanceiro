'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Widget de consentimento do Open Finance.
 *
 * O vínculo com banco real **só** nasce aqui: o usuário escolhe a instituição,
 * autoriza o compartilhamento no app do banco e o agregador devolve um `item`.
 * Não guardamos senha bancária — quem coleta as credenciais é o agregador
 * regulado, e o app recebe apenas os dados autorizados.
 *
 * Por que carregar o script do CDN em vez de empacotar o SDK: o widget precisa
 * rodar só no navegador e é atualizado pelo provedor (mudanças de banco,
 * MFA, OAuth). Um `import` estático quebraria o SSR; o script é carregado
 * sob demanda, quando o usuário clica em "Conectar banco".
 */

type PluggyConnectInstance = { init: () => void; close?: () => void };

type PluggyConnectCtor = new (options: {
  connectToken: string;
  includeSandbox?: boolean;
  language?: string;
  theme?: 'light' | 'dark';
  onSuccess: (data: { item: { id: string } }) => void;
  onError: (error: { message?: string }) => void;
  onClose?: () => void;
}) => PluggyConnectInstance;

declare global {
  interface Window {
    PluggyConnect?: PluggyConnectCtor;
  }
}

const WIDGET_SRC = 'https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js';
const WIDGET_SCRIPT_ID = 'pluggy-connect-script';

/** Carrega o script do widget uma única vez por sessão de navegador. */
function loadWidgetScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Sem navegador'));
  if (window.PluggyConnect) return Promise.resolve();

  const existing = document.getElementById(WIDGET_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar o widget')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = WIDGET_SCRIPT_ID;
    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar o widget do Open Finance'));
    document.body.appendChild(script);
  });
}

export type ConnectResult = { itemId: string | null; error?: string };

/**
 * Abre o widget e resolve quando ele fecha.
 *
 * Devolve o `itemId` em caso de sucesso, ou `null` se o usuário desistir —
 * desistir não é erro, então não mostramos alerta nesse caso.
 */
export async function openConnectWidget(options: {
  connectToken: string;
  includeSandbox?: boolean;
  theme?: 'light' | 'dark';
}): Promise<ConnectResult> {
  await loadWidgetScript();
  const Ctor = window.PluggyConnect;
  if (!Ctor) return { itemId: null, error: 'Widget do Open Finance indisponível' };

  return new Promise<ConnectResult>((resolve) => {
    let settled = false;
    const finish = (result: ConnectResult) => {
      if (settled) return; // onSuccess + onClose podem disparar juntos.
      settled = true;
      resolve(result);
    };

    const widget = new Ctor({
      connectToken: options.connectToken,
      includeSandbox: options.includeSandbox,
      language: 'pt',
      theme: options.theme,
      onSuccess: ({ item }) => finish({ itemId: item?.id ?? null }),
      onError: ({ message }) =>
        finish({ itemId: null, error: message ?? 'O banco não concluiu a autorização.' }),
      onClose: () => finish({ itemId: null }),
    });
    widget.init();
  });
}

/**
 * Botão de conectar banco com o widget.
 *
 * O consumidor passa `connectToken` (vindo da API) e recebe o resultado. O
 * componente cuida do carregamento do script e do estado "abrindo…".
 */
export function ConnectBankButton({
  connectToken,
  onFinished,
  disabled,
  children,
}: {
  connectToken: string | null;
  onFinished: (result: ConnectResult) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const [opening, setOpening] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const handleClick = useCallback(async () => {
    if (!connectToken) return;
    setOpening(true);
    try {
      const result = await openConnectWidget({ connectToken });
      if (mounted.current) onFinished(result);
    } catch (error) {
      if (mounted.current) {
        onFinished({
          itemId: null,
          error: error instanceof Error ? error.message : 'Não foi possível abrir o widget.',
        });
      }
    } finally {
      if (mounted.current) setOpening(false);
    }
  }, [connectToken, onFinished]);

  return (
    <button
      className="button button-primary"
      disabled={disabled || !connectToken || opening}
      onClick={() => void handleClick()}
      type="button"
    >
      {opening ? 'Abrindo autorização…' : (children ?? 'Conectar banco')}
    </button>
  );
}
