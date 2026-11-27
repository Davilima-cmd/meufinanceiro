import type { ReactNode } from 'react';

/**
 * Ilustrações do CAJU Finance.
 *
 * Peças desenhadas à mão (moeda, nota, raio, carretel de linha e rabisco) na
 * paleta do manual: laranja Caju, coral, roxo e verde. Tudo em SVG com
 * variáveis de cor, então acompanha o tema claro/escuro sem peso de imagem e
 * sem requisição extra.
 */

/** Rabisco decorativo de fundo (o "espiral" solto da referência). */
export function Scribble({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`illu-scribble ${className}`.trim()}
      fill="none"
      viewBox="0 0 200 260"
    >
      <path
        d="M188 12c-44 6-78 30-96 62-17 30-8 58 16 62 22 4 38-16 34-36-4-19-27-25-48-14-26 13-40 42-36 74 4 33 28 52 58 48"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="20"
      />
    </svg>
  );
}

/** Raio de quatro pontas, usado como brilho perto de números e títulos. */
export function Spark({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={`illu-spark ${className}`.trim()} viewBox="0 0 24 24">
      <path
        d="M12 1.5c.9 5.2 3 7.3 8.2 8.2-5.2.9-7.3 3-8.2 8.2-.9-5.2-3-7.3-8.2-8.2 5.2-.9 7.3-3 8.2-8.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Moeda com cifrão, contorno grosso e hachura — a peça mais repetida do estilo. */
export function Coin({ className = '', size = 64 }: { className?: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className={`illu-coin ${className}`.trim()}
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      <defs>
        <linearGradient id="illu-coin-grad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="var(--illu-coin)" />
          <stop offset="1" stopColor="var(--illu-coin-2)" />
        </linearGradient>
      </defs>
      <circle
        cx="32"
        cy="32"
        fill="url(#illu-coin-grad)"
        r="27"
        stroke="var(--ink)"
        strokeWidth="4"
      />
      <circle
        cx="32"
        cy="32"
        fill="none"
        r="20"
        stroke="var(--ink)"
        strokeDasharray="3 5"
        strokeWidth="2"
      />
      <path
        d="M33 14v6m0 24v6M27 23h8a5 5 0 0 1 0 10h-6a5 5 0 0 0 0 10h9"
        fill="none"
        stroke="var(--ink)"
        strokeLinecap="round"
        strokeWidth="3.4"
      />
    </svg>
  );
}

/** Nota de dinheiro inclinada. */
export function Banknote({ className = '', size = 96 }: { className?: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className={`illu-note ${className}`.trim()}
      height={size * 0.6}
      viewBox="0 0 100 60"
      width={size}
    >
      <rect
        fill="var(--illu-note)"
        height="44"
        rx="7"
        stroke="var(--ink)"
        strokeWidth="4"
        transform="rotate(-8 50 30)"
        width="80"
        x="10"
        y="8"
      />
      <circle
        cx="50"
        cy="30"
        fill="none"
        r="13"
        stroke="var(--ink)"
        strokeWidth="3.2"
        transform="rotate(-8 50 30)"
      />
      <path
        d="M46 24c2.6 0 4 1.4 4 4s-1.4 4-4 4h-1v3m1-14v3"
        fill="none"
        stroke="var(--ink)"
        strokeLinecap="round"
        strokeWidth="2.6"
        transform="rotate(-8 50 30)"
      />
    </svg>
  );
}

/** Card ilustrado de destaque: fundo chapado, contorno e rabisco no canto. */
export function Sticker({ children, tone = 'mint' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`sticker is-${tone}`}>
      <Scribble className="sticker-scribble" />
      {children}
    </span>
  );
}
