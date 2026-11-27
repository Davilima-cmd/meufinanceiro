import type { ReactNode } from 'react';

/**
 * Marca do CAJU Finance.
 *
 * O símbolo é o "c" do manual da marca: duas formas arredondadas que se
 * encontram, em degradê do laranja Caju ao coral e ao roxo, com o ponto
 * laranja solto em cima. Funciona de 16px (favicon) a 96px (tela de boot).
 */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="brand-mark"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.34) }}
    >
      <svg fill="none" viewBox="0 0 32 32">
        <defs>
          <linearGradient id="brand-c-grad" x1="4" x2="28" y1="6" y2="28">
            <stop offset="0" stopColor="#f7931e" />
            <stop offset="0.52" stopColor="#f26d6d" />
            <stop offset="1" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        {/* corpo do "c": forma de gota que abraça o vazio */}
        <path
          d="M23.4 8.2c-2.6-2.2-6.2-2.6-9.2-1-4.1 2.2-5.8 7.2-3.8 11.4 2 4.2 6.9 6 11.1 4.1 2-1 3.5-2.7 4.3-4.7-1.9.9-4.1 1.1-6.1.3-3.6-1.4-5.4-5.5-4-9.1.8-2 2.6-3.5 4.7-4-1 .9-1.9 2-2.6 3.3"
          fill="url(#brand-c-grad)"
        />
        {/* segunda forma, mais escura, dá o encontro das duas metades */}
        <path
          d="M17.8 23.6c3.7-.3 6.8-2.9 7.7-6.5-1.9 1-4.2 1.2-6.2.4 2.3-.4 4.4-1.8 5.6-3.8-2.6-1.4-5.8-1.4-8.3.2-3.2 2-4.3 6.1-2.4 9.3"
          fill="url(#brand-c-grad)"
          opacity="0.96"
        />
        {/* ponto solto */}
        <circle cx="22.6" cy="5.2" fill="#f7931e" r="2.5" />
      </svg>
    </span>
  );
}

/** Bloco de marca (ícone + nome + assinatura). */
export function BrandLockup({ children }: { children?: ReactNode }) {
  return (
    <span className="brand-copy">
      <strong>CAJU Finance</strong>
      <small>Ideias que conectam. Soluções que transformam.</small>
      {children}
    </span>
  );
}
