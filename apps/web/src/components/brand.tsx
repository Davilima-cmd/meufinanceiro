import type { ReactNode } from 'react';

/**
 * Marca do CAJU Finance.
 *
 * O logo antes era o texto "mf" num quadrado com gradiente roxo. Aqui vira um
 * caju desenhado (folha + corpo), que é o nome do produto e funciona como
 * ícone em qualquer tamanho — inclusive no favicon e na tela de boot.
 */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="brand-mark"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.34) }}
    >
      <svg
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        viewBox="0 0 24 24"
      >
        {/* corpo do caju */}
        <path d="M13.2 8.4c3.4.6 5.6 3.3 5.4 6.7-.2 3.4-3 5.6-6.4 5.4-3.3-.2-5.6-3-5.4-6.3.2-3.4 3-5.9 6.4-5.8Z" />
        {/* castanha */}
        <path d="M13.2 8.4c-.4-1.6.2-3.1 1.7-3.9 1.4-.8 3-.5 4 .6-.9 1.4-2.3 2.6-4.2 3.2" />
        {/* talo */}
        <path d="M6.6 8.2 4.6 5.4" />
      </svg>
    </span>
  );
}

/** Bloco de marca (ícone + nome + assinatura). */
export function BrandLockup({ children }: { children?: ReactNode }) {
  return (
    <span className="brand-copy">
      <strong>CAJU Finance</strong>
      <small>Espaço financeiro do casal</small>
      {children}
    </span>
  );
}
