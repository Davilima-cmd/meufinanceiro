import type { Metadata, Viewport } from 'next';
import './styles.css';
import { FinanceProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: 'Meu Financeiro — finanças a dois',
  description:
    'Painel financeiro para duas pessoas: contas, lançamentos, orçamentos e metas em um só lugar.',
};

export const viewport: Viewport = {
  themeColor: '#0b0d12',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <FinanceProvider>{children}</FinanceProvider>
      </body>
    </html>
  );
}
