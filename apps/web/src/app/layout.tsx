import type { Metadata } from 'next';
import './finance.css';
import { AuthProvider } from '../contexts/auth-context';

export const metadata: Metadata = {
  title: 'Meu Financeiro',
  description: 'Organização financeira para duas pessoas.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
