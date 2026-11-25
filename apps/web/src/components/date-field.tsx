'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatMonth, todayISO } from '@/lib/format';

/* -------------------------------------------------------------------------
   Campo de data com calendário próprio (substitui <input type="date">)
   ------------------------------------------------------------------------- */

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Date ancorada ao meio-dia UTC para não escorregar de dia no fuso local. */
function parseISO(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

function formatFull(iso: string): string {
  const date = parseISO(iso);
  return `${String(date.getUTCDate()).padStart(2, '0')} de ${MONTH_NAMES[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

function shiftMonthDate(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1, 12));
}

function buildGrid(viewDate: Date): Array<{ date: Date; iso: string } | null> {
  const first = new Date(Date.UTC(viewDate.getUTCFullYear(), viewDate.getUTCMonth(), 1, 12));
  const offset = first.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(viewDate.getUTCFullYear(), viewDate.getUTCMonth() + 1, 0, 12)
  ).getUTCDate();
  const cells: Array<{ date: Date; iso: string } | null> = [];
  for (let index = 0; index < offset; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(viewDate.getUTCFullYear(), viewDate.getUTCMonth(), day, 12));
    cells.push({ date, iso: toISO(date) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder = 'Escolha uma data',
  id,
  allowClear = false,
  clearLabel = 'Limpar',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  id?: string;
  allowClear?: boolean;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseISO(value || todayISO()));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const panelId = `${id ?? generatedId}-calendar`;

  const today = todayISO();
  const cells = useMemo(() => buildGrid(viewDate), [viewDate]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // O foco vai para o menu assim que ele monta, para as setas navegarem as opções.
    gridRef.current?.focus();
  }, [open]);

  function isDisabled(iso: string): boolean {
    if (min && iso < min.slice(0, 10)) return true;
    if (max && iso > max.slice(0, 10)) return true;
    return false;
  }

  function openCalendar() {
    setViewDate(parseISO(value || todayISO()));
    setOpen(true);
  }

  function choose(iso: string) {
    if (isDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveFocus(deltaDays: number) {
    const base = value && sameMonth(parseISO(value), viewDate) ? parseISO(value) : viewDate;
    const next = new Date(base.getTime() + deltaDays * 86_400_000);
    if (!sameMonth(next, viewDate)) setViewDate(next);
    const iso = toISO(next);
    if (!isDisabled(iso)) onChange(iso);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(-7);
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(7);
        break;
      case 'PageUp':
        event.preventDefault();
        setViewDate((current) => shiftMonthDate(current, -1));
        break;
      case 'PageDown':
        event.preventDefault();
        setViewDate((current) => shiftMonthDate(current, 1));
        break;
      case 'Enter':
      case ' ':
        if (value) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  }

  const monthLabel = `${MONTH_NAMES[viewDate.getUTCMonth()]} de ${viewDate.getUTCFullYear()}`;

  return (
    <div className="select date-field" ref={rootRef}>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="select-trigger"
        id={id}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openCalendar();
          }
        }}
        ref={triggerRef}
        type="button"
      >
        {value ? (
          <span className="select-value">{formatFull(value)}</span>
        ) : (
          <span className="select-placeholder">{placeholder}</span>
        )}
        <svg aria-hidden="true" className="select-caret" fill="none" viewBox="0 0 24 24">
          <path
            d="M7 3v3m10-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      </button>

      {open ? (
        <div
          aria-label={label}
          aria-modal="false"
          className="calendar"
          id={panelId}
          onKeyDown={handleKeyDown}
          ref={gridRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className="calendar-head">
            <button
              aria-label="Mês anterior"
              className="icon-button"
              onClick={() => setViewDate((current) => shiftMonthDate(current, -1))}
              type="button"
            >
              ←
            </button>
            <strong>{monthLabel}</strong>
            <button
              aria-label="Próximo mês"
              className="icon-button"
              onClick={() => setViewDate((current) => shiftMonthDate(current, 1))}
              type="button"
            >
              →
            </button>
          </div>

          <div aria-hidden="true" className="calendar-weekdays">
            {WEEKDAYS.map((weekday, index) => (
              <span key={`${weekday}-${index}`}>{weekday}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {cells.map((cell, index) =>
              cell ? (
                <button
                  aria-current={cell.iso === today ? 'date' : undefined}
                  aria-label={formatFull(cell.iso)}
                  aria-selected={cell.iso === (value || '').slice(0, 10)}
                  className={[
                    'calendar-day',
                    cell.iso === (value || '').slice(0, 10) ? 'is-selected' : '',
                    cell.iso === today ? 'is-today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={isDisabled(cell.iso)}
                  key={cell.iso}
                  onClick={() => choose(cell.iso)}
                  type="button"
                >
                  {cell.date.getUTCDate()}
                </button>
              ) : (
                <span aria-hidden="true" className="calendar-empty" key={`empty-${index}`} />
              )
            )}
          </div>

          <div className="calendar-foot">
            <button
              className="button button-ghost"
              disabled={isDisabled(today)}
              onClick={() => choose(today)}
              type="button"
            >
              Hoje
            </button>
            {allowClear ? (
              <button
                className="button button-ghost"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                type="button"
              >
                {clearLabel}
              </button>
            ) : null}
            <span className="calendar-hint">
              {formatMonth(value ? value.slice(0, 7) : today.slice(0, 7))}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
