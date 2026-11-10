import type { Metadata } from 'next';
import './finance.css';

export const metadata: Metadata = {
  title: 'Meu Financeiro',
  description: 'Organização financeira para duas pessoas.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
