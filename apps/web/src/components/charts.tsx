'use client';

import { formatBRL } from '@/lib/format';

type Slice = { label: string; cents: bigint; color: string };

/** Donut em SVG puro (sem dependências) com legenda acessível. */
export function Donut({ data, size = 168 }: { data: Slice[]; size?: number }) {
  const total = data.reduce((sum, slice) => sum + slice.cents, 0n);
  const visible = data.filter((slice) => slice.cents > 0n);
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  // Deslocamento acumulado de cada fatia, calculado antes do render.
  const segments = visible.reduce<Array<{ slice: Slice; length: number; offset: number }>>(
    (acc, slice) => {
      const previous = acc.length > 0 ? acc[acc.length - 1] : null;
      const offset = previous ? previous.offset + previous.length : 0;
      const length = (Number(slice.cents) / Number(total)) * circumference;
      acc.push({ slice, length, offset });
      return acc;
    },
    []
  );

  if (visible.length === 0 || total === 0n) {
    return (
      <div className="donut-empty" style={{ width: size, height: size }}>
        <span>Sem despesas</span>
      </div>
    );
  }

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg aria-hidden="true" viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="donut-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="14"
        />
        {segments.map(({ slice, length, offset }) => (
          <circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            key={slice.label}
            r={radius}
            stroke={slice.color}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            strokeWidth="14"
          />
        ))}
      </svg>
      <div className="donut-center">
        <small>Total</small>
        <strong>{formatBRL(total)}</strong>
      </div>
    </div>
  );
}

type Point = { label: string; incomeCents: bigint; expenseCents: bigint; netCents: bigint };

/** Gráfico de colunas comparando entradas e saídas por mês. */
export function FlowChart({ data }: { data: Point[] }) {
  const max = data.reduce(
    (peak, point) => Math.max(peak, Number(point.incomeCents), Number(point.expenseCents)),
    0
  );
  const baseline = Math.max(max, 1);

  return (
    <div className="flow-chart">
      <div className="flow-legend">
        <span>
          <i className="swatch is-income" /> Entradas
        </span>
        <span>
          <i className="swatch is-expense" /> Saídas
        </span>
      </div>
      <div className="flow-bars">
        {data.map((point) => {
          const income = Math.round((Number(point.incomeCents) / baseline) * 100);
          const expense = Math.round((Number(point.expenseCents) / baseline) * 100);
          return (
            <div className="flow-column" key={point.label}>
              <div className="flow-column-bars">
                <span
                  className="flow-bar is-income"
                  style={{ height: `${Math.max(income, 2)}%` }}
                  title={`Entradas: ${formatBRL(point.incomeCents)}`}
                />
                <span
                  className="flow-bar is-expense"
                  style={{ height: `${Math.max(expense, 2)}%` }}
                  title={`Saídas: ${formatBRL(point.expenseCents)}`}
                />
              </div>
              <span className="flow-label">{point.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Sparkline de saldo acumulado dentro do mês. */
export function BalanceSparkline({ points }: { points: bigint[] }) {
  if (points.length < 2) {
    return null;
  }
  const values = points.map((point) => Number(point));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 320;
  const height = 72;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 8) - 4;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg aria-hidden="true" className="sparkline" viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d={`${path} L${width},${height} L0,${height} Z`}
        fill="url(#spark-fade)"
        stroke="none"
      />
      <defs>
        <linearGradient id="spark-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
