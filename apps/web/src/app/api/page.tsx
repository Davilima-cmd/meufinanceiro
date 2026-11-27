'use client'; /* eslint-disable react-hooks/set-state-in-effect -- hidratação/redirecionamento exclusivo do cliente (localStorage/sessionStorage) */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFinance } from '@/lib/store';
import { BrandMark } from '@/components/brand';
import type { FinanceUser } from '@/lib/types';

type StoredApiSession = {
  token?: string;
  user?: { id: string; name: string; email: string; mfaEnabled?: boolean };
};

/** Entra no modo API usando a sessão salva pelo login na tela /login. */
export default function ApiEntryPage() {
  const { startApiSession, hydrated, session } = useFinance();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hydrated) return;
    if (session?.mode === 'api') {
      router.replace('/');
      return;
    }
    try {
      const raw = localStorage.getItem('mf.session.api');
      if (!raw) {
        router.replace('/login');
        return;
      }
      const parsed = JSON.parse(raw) as StoredApiSession;
      if (!parsed.user) {
        router.replace('/login');
        return;
      }
      const user: FinanceUser = {
        id: parsed.user.id,
        name: parsed.user.name,
        email: parsed.user.email,
        mfaEnabled: parsed.user.mfaEnabled,
      };
      void startApiSession(user).then(() => router.replace('/'));
    } catch {
      setError('Não foi possível retomar a sessão. Entre novamente.');
    }
  }, [hydrated, session, startApiSession, router]);

  return (
    <div className="boot" aria-busy="true">
      <BrandMark size={48} />
      <span>{error || 'Retomando sua sessão…'}</span>
    </div>
  );
}
