'use client';

import { useId } from 'react';
import { centsFromInput } from '@/lib/format';

/**
 * Campo de dinheiro com máscara de centavos.
 *
 * Antes: `<input inputMode="decimal">` cru. O usuário digitava `7452` no "Saldo
 * atual", via `7452` na tela e o app salvava R$ 7.452,00 — quando a intenção
 * era R$ 74,52. Aqui cada dígito entra pela direita, como em caixa eletrônico:
 * `7` → 0,07 · `74` → 0,74 · `745` → 7,45 · `7452` → 74,52. Colar um valor
 * completo (`1.234,56`) também funciona, porque os separadores são ignorados.
 * O texto entregue ao formulário fica no formato brasileiro e o valor em reais
 * aparece confirmado logo abaixo do campo.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  placeholder = '0,00',
  hint,
  id,
  ariaLabel,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  id?: string;
  ariaLabel?: string;
  onEnter?: () => void;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const previewId = `${fieldId}-preview`;

  /** `7452` → `74,52`; `123456` → `1.234,56`; vazio continua vazio. */
  const masked = maskCents(value);
  const cents = centsFromInput(masked);
  const preview = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(cents) / 100);

  function handleChange(raw: string) {
    onChange(maskCents(raw));
  }

  return (
    <label className="field" htmlFor={fieldId}>
      <span>{label}</span>
      <div className={`money-field ${masked ? 'has-value' : ''}`}>
        <span aria-hidden="true" className="money-prefix">
          R$
        </span>
        <input
          aria-describedby={previewId}
          aria-label={ariaLabel ?? label}
          autoComplete="off"
          className="input money-input"
          id={fieldId}
          inputMode="decimal"
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && onEnter) {
              event.preventDefault();
              onEnter();
            }
            // Backspace com o campo no formato "1.234,56" apagaria só a última
            // vírgula visual e não mexeria no valor: apaga um dígito de verdade.
            if (event.key === 'Backspace') {
              event.preventDefault();
              const digits = masked.replace(/\D/g, '');
              handleChange(digits.slice(0, -1));
            }
          }}
          placeholder={placeholder}
          value={masked}
        />
      </div>
      <small className="money-preview" id={previewId}>
        {masked ? (
          <>
            <strong>{preview}</strong>
            {hint ? <span> · {hint}</span> : null}
          </>
        ) : (
          <span>{hint ?? 'Digite só os números: 7452 vira R$ 74,52'}</span>
        )}
      </small>
    </label>
  );
}

/**
 * Aplica a máscara de centavos. Aceita sinal negativo (fatura de cartão) e
 * descarta qualquer coisa que não seja dígito.
 */
export function maskCents(raw: string): string {
  const negative = raw.trim().startsWith('-');
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return negative ? '-' : '';
  const padded = digits.padStart(3, '0');
  const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${fraction}`;
}
