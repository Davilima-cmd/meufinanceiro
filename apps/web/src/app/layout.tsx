import type { Metadata, Viewport } from 'next';
import './styles.css';
import { DialogProvider } from '@/components/dialog';
import { FinanceProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: 'CAJU Finance — espaço financeiro do casal',
  description:
    'Saldo consolidado, movimentações, orçamentos e metas de um casal, com transparência e privacidade.',
};

export const viewport: Viewport = {
  themeColor: '#176b45',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <FinanceProvider>
          <DialogProvider>{children}</DialogProvider>
        </FinanceProvider>
      </body>
    </html>
  );
}
