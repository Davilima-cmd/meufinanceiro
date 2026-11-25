'use client';

import type { ReactNode } from 'react';
import { useFinance } from '@/lib/store';
import { formatBRL } from '@/lib/format';

/** Valor monetário com suporte a "ocultar valores". */
export function Money({
  value,
  className,
  signed = false,
  hiddenOverride,
}: {
  value: bigint | string | number;
  className?: string;
  signed?: boolean;
  hiddenOverride?: boolean;
}) {
  const { snapshot } = useFinance();
  const hidden = hiddenOverride ?? snapshot.settings.hideValues;
  if (hidden) {
    return (
      <span className={className} aria-label="Valor oculto">
        ••••
      </span>
    );
  }
  const cents = typeof value === 'bigint' ? value : BigInt(value);
  const prefix = signed && cents > 0n ? '+' : '';
  return (
    <span className={className}>
      {prefix}
      {formatBRL(cents)}
    </span>
  );
}

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
}) {
  return <Tag className={`card ${className}`.trim()}>{children}</Tag>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent' | 'warning';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ProgressBar({
  percent,
  color,
  tone,
}: {
  percent: number;
  color?: string;
  tone?: 'positive' | 'negative' | 'accent';
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className={tone ? `progress-fill is-${tone}` : 'progress-fill'}
        style={{ width: `${clamped}%`, ...(color ? { background: color } : {}) }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = '◇',
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true" className="empty-icon">
        {icon}
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'positive' | 'negative';
  children?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className={`stat-value ${tone ? `is-${tone}` : ''}`}>{value}</strong>
      {hint ? <span className="stat-hint">{hint}</span> : null}
      {children}
    </div>
  );
}
