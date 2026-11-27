import type { Metadata, Viewport } from 'next';
// Nunito vem do pacote npm (@fontsource), não do CDN do Google: o build fica
// offline-safe, o arquivo é servido junto com o app e não há requisição externa
// no navegador. Variável de 200 a 1000 cobre títulos pesados e texto comum.
import '@fontsource-variable/nunito';
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
