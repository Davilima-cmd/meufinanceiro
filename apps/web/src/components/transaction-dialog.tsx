'use client';

import { useMemo, useState } from 'react';
import { useFinance } from '@/lib/store';
import { centsFromInput, formatBRL, todayISO } from '@/lib/format';
import type { TransactionType } from '@/lib/types';

type Props = {
  open: boolean;
  onClose: () => void;
  defaultType?: TransactionType;
  defaultDate?: string;
};

export function TransactionDialog({ open, onClose, defaultType = 'expense', defaultDate }: Props) {
  const { snapshot, addTransaction } = useFinance();
  const [type, setType] = useState<TransactionType>(defaultType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(snapshot.accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(defaultDate ?? todayISO());
  const [error, setError] = useState('');

  const categories = useMemo(() => {
    if (type === 'transfer') return snapshot.categories.filter((item) => item.kind !== 'expense');
    return snapshot.categories.filter(
      (item) => item.kind === type || item.kind === 'both' || item.kind === 'income'
    );
  }, [snapshot.categories, type]);

  if (!open) return null;

  const cents = centsFromInput(amount);
  const absolute = cents < 0n ? -cents : cents;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!description.trim()) {
      setError('Descreva o lançamento.');
      return;
    }
    if (absolute <= 0n) {
      setError('Informe um valor maior que zero.');
      return;
    }
    if (!accountId) {
      setError('Escolha uma conta.');
      return;
    }
    const signed = type === 'income' ? absolute : -absolute;
    addTransaction({
      accountId,
      categoryId: categoryId || null,
      description,
      amountCents: signed.toString(),
      type,
      date,
    });
    setDescription('');
    setAmount('');
    setCategoryId('');
    onClose();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-labelledby="dialog-title"
        aria-modal="true"
        className="dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Novo lançamento</p>
            <h2 id="dialog-title">Registrar movimentação</h2>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ✕
          </button>
        </header>

        <form className="dialog-form" onSubmit={handleSubmit}>
          <div className="segmented" role="tablist" aria-label="Tipo de lançamento">
            {(
              [
                { value: 'expense', label: 'Despesa' },
                { value: 'income', label: 'Receita' },
                { value: 'transfer', label: 'Transferência' },
              ] as const
            ).map((option) => (
              <button
                aria-selected={type === option.value}
                className={type === option.value ? 'is-selected' : ''}
                key={option.value}
                onClick={() => {
                  setType(option.value);
                  setCategoryId('');
                }}
                role="tab"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="field">
            <span>Valor</span>
            <input
              aria-label="Valor"
              autoFocus
              className="input input-amount"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              value={amount}
            />
            <small className="field-hint">
              {absolute > 0n
                ? `Será salvo como ${formatBRL(type === 'income' ? absolute : -absolute)}`
                : 'Use vírgula ou ponto para os centavos'}
            </small>
          </label>

          <label className="field">
            <span>Descrição</span>
            <input
              aria-label="Descrição"
              className="input"
              maxLength={120}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Mercado do bairro"
              value={description}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Conta</span>
              <select
                className="input"
                onChange={(event) => setAccountId(event.target.value)}
                value={accountId}
              >
                {snapshot.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Categoria</span>
              <select
                className="input"
                onChange={(event) => setCategoryId(event.target.value)}
                value={categoryId}
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Data</span>
            <input
              className="input"
              max={todayISO()}
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <footer className="dialog-footer">
            <button className="button button-ghost" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="button button-primary" type="submit">
              Salvar lançamento
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
