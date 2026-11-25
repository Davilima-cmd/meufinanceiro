'use client';

import { useMemo, useState } from 'react';
import { DateField } from '@/components/date-field';
import { Select } from '@/components/dialog';
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
  const [transferAccountId, setTransferAccountId] = useState(snapshot.accounts[1]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
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

  async function handleSubmit(event: React.FormEvent) {
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
    if (type === 'transfer' && (!transferAccountId || transferAccountId === accountId)) {
      setError('Escolha uma conta de destino diferente da origem.');
      return;
    }
    const signed = type === 'income' ? absolute : -absolute;
    setSubmitting(true);
    // A API é a dona da verdade: se ela recusar, o erro aparece aqui e o
    // formulário continua aberto com os dados preenchidos.
    const failure = await addTransaction({
      accountId,
      categoryId: categoryId || null,
      description,
      amountCents: signed.toString(),
      type,
      transferAccountId: type === 'transfer' ? transferAccountId : null,
      date,
    });
    setSubmitting(false);
    if (failure) {
      setError(failure);
      return;
    }
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
            <div className="field">
              <span>Conta</span>
              <Select
                label="Conta do lançamento"
                onChange={setAccountId}
                options={snapshot.accounts.map((account) => ({
                  value: account.id,
                  label: account.name,
                  color: account.color,
                  hint: account.shareLevel === 'private' ? undefined : 'compartilhada',
                }))}
                value={accountId}
              />
            </div>
            <div className="field">
              <span>Categoria</span>
              <Select
                label="Categoria do lançamento"
                onChange={setCategoryId}
                options={[
                  { value: '', label: 'Sem categoria' },
                  ...categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                    color: category.color,
                  })),
                ]}
                value={categoryId}
              />
            </div>
          </div>

          {type === 'transfer' ? (
            <div className="field">
              <span>Conta de destino</span>
              <Select
                label="Conta que recebe a transferência"
                onChange={setTransferAccountId}
                options={snapshot.accounts
                  .filter((account) => account.id !== accountId)
                  .map((account) => ({
                    value: account.id,
                    label: account.name,
                    color: account.color,
                  }))}
                value={transferAccountId}
              />
              <small className="field-hint">
                Transferência não entra como receita nem despesa: só move o saldo entre as contas.
              </small>
            </div>
          ) : null}

          <div className="field">
            <span>Data</span>
            <DateField
              label="Data do lançamento"
              max={todayISO()}
              onChange={setDate}
              value={date}
            />
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <footer className="dialog-footer">
            <button className="button button-ghost" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="button button-primary" disabled={submitting} type="submit">
              {submitting ? 'Salvando…' : 'Salvar lançamento'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
