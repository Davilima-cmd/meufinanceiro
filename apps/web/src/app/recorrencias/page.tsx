'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiRecurrence } from '@meufinanceiro/shared-types';
import { AppShell } from '@/components/app-shell';
import { Select, useDialog } from '@/components/dialog';
import { Badge, Card, EmptyState, Money, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { centsFromInput, formatDay, toCents } from '@/lib/format';
import { useFinance } from '@/lib/store';
import { MoneyInput } from '@/components/money-input';

/**
 * Recorrências (aluguel, salário, assinatura).
 *
 * O backend existia desde as primeiras versões — com rotina diária e cron — mas
 * **nenhuma tela**. O único jeito de criar uma recorrência era chamar a API na
 * mão, então o recurso não existia para quem usa o produto. Aqui ficam as três
 * ações que importam: criar, pausar/retomar e excluir.
 */
/**
 * Sinal do valor da recorrência.
 *
 * A API guarda o valor **com sinal** (`expense` negativo) e recusa o contrário
 * com 400. A tela pede o valor sempre positivo e aplica o sinal aqui, para a
 * pessoa não ter que digitar `-`.
 */
export function signedRecurrenceAmount(type: 'income' | 'expense', cents: bigint): bigint {
  if (cents === 0n) return 0n;
  const absolute = cents < 0n ? -cents : cents;
  return type === 'expense' ? -absolute : absolute;
}

export default function RecurrencesPage() {
  const { snapshot } = useFinance();
  const dialog = useDialog();

  const [rows, setRows] = useState<ApiRecurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('5');

  const accounts = useMemo(
    // `readOnly` é a decisão de acesso que a API já tomou; conta somente leitura
    // não pode receber lançamento gerado por recorrência.
    () => snapshot.accounts.filter((account) => !account.access?.readOnly),
    [snapshot.accounts]
  );
  const categories = useMemo(
    () =>
      snapshot.categories.filter((category) =>
        type === 'income' ? category.kind !== 'expense' : category.kind !== 'income'
      ),
    [snapshot.categories, type]
  );

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      setRows(await api.getRecurrences());
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // `load` é async: o `setLoading` acontece depois do primeiro await, fora do
    // render. Chamar em uma microtask mantém o efeito livre de setState sincrono.
    void Promise.resolve().then(() => load());
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!description.trim()) return setError('Descreva a recorrência.');
    if (!accountId) return setError('Escolha a conta de onde o lançamento sai.');

    const cents = centsFromInput(amount);
    if (cents === 0n) return setError('Informe um valor maior que zero.');
    const signed = signedRecurrenceAmount(type, cents);
    const day = Number(dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      return setError('O dia deve estar entre 1 e 28 (não existe 30 de fevereiro).');
    }

    setBusy(true);
    try {
      await api.createRecurrence({
        accountId,
        categoryId: categoryId || undefined,
        description: description.trim(),
        amountCents: signed.toString(),
        type,
        dayOfMonth: day,
      });
      setDescription('');
      setAmount('');
      await load(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: ApiRecurrence) {
    setBusy(true);
    try {
      await api.setRecurrenceActive(row.id, !row.active);
      await load(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível alterar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: ApiRecurrence) {
    const confirmed = await dialog.confirm({
      title: `Excluir “${row.description}”?`,
      description:
        'Os lançamentos já gerados continuam no histórico. A recorrência deixa de criar novos.',
      confirmLabel: 'Excluir recorrência',
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.deleteRecurrence(row.id);
      await load(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  }

  const accountName = useMemo(
    () => new Map(snapshot.accounts.map((account) => [account.id, account.name])),
    [snapshot.accounts]
  );
  const categoryName = useMemo(
    () => new Map(snapshot.categories.map((category) => [category.id, category.name])),
    [snapshot.categories]
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Todo mês"
        title="Recorrências"
        description="Lançamentos que se repetem: aluguel, salário, assinatura. A rotina cria sozinha no dia escolhido."
      />

      <div className="stack">
        {error ? (
          <Card className="notice notice-error">
            <strong>{error}</strong>
          </Card>
        ) : null}

        <Card>
          <div className="card-heading">
            <div>
              <h2>Nova recorrência</h2>
              <p>O valor entra no mês em que é gerado — nada é lançado com data futura.</p>
            </div>
          </div>
          <form className="form-row" onSubmit={handleSubmit}>
            <label className="field">
              <span>Descrição</span>
              <input
                maxLength={128}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Aluguel"
                value={description}
              />
            </label>
            <MoneyInput
              hint="despesa sai do saldo; receita entra"
              label="Valor"
              onChange={setAmount}
              placeholder="1.500,00"
              value={amount}
            />
            <Select
              label="Tipo"
              onChange={(value) => {
                setType(value === 'income' ? 'income' : 'expense');
                setCategoryId('');
              }}
              options={[
                { value: 'expense', label: 'Despesa' },
                { value: 'income', label: 'Receita' },
              ]}
              value={type}
            />
            <Select
              label="Conta"
              onChange={setAccountId}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              placeholder={accounts.length ? 'Escolha a conta…' : 'Nenhuma conta com escrita'}
              value={accountId}
            />
            <Select
              label="Categoria"
              onChange={setCategoryId}
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
                color: category.color,
              }))}
              placeholder="Sem categoria"
              value={categoryId}
            />
            <label className="field">
              <span>Dia do mês</span>
              <input
                inputMode="numeric"
                max={28}
                min={1}
                onChange={(event) => setDayOfMonth(event.target.value)}
                type="number"
                value={dayOfMonth}
              />
            </label>
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? 'Salvando…' : 'Criar recorrência'}
            </button>
          </form>
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Ativas e pausadas</h2>
              <p>Pausar para de gerar; retomar volta a valer do próximo dia útil escolhido.</p>
            </div>
          </div>
          {loading ? (
            <p className="account-sub">Carregando recorrências…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nenhuma recorrência"
              description="Cadastre o aluguel ou o salário para não precisar lançar todo mês."
            />
          ) : (
            <ul className="list">
              {rows.map((row) => {
                const cents = toCents(row.amountCents);
                return (
                  <li className="list-row" key={row.id}>
                    <span className="row-mark" aria-hidden="true">
                      ↻
                    </span>
                    <div className="row-copy">
                      <strong>{row.description}</strong>
                      <small>
                        dia {row.dayOfMonth} · {accountName.get(row.accountId) ?? 'Conta'}
                        {row.categoryId ? ` · ${categoryName.get(row.categoryId) ?? ''}` : ''}
                      </small>
                    </div>
                    <div className="row-end">
                      <span className={`row-amount ${cents < 0n ? 'is-negative' : 'is-positive'}`}>
                        <Money value={cents} signed />
                      </span>
                      <Badge tone={row.active ? 'positive' : 'warning'}>
                        {row.active ? 'ativa' : 'pausada'}
                      </Badge>
                    </div>
                    <div className="row-actions">
                      <span className="account-sub">próxima: {formatDay(row.nextRunAt)}</span>
                      <button
                        aria-label={row.active ? 'Pausar' : 'Retomar'}
                        className="icon-button"
                        disabled={busy}
                        onClick={() => void toggle(row)}
                        type="button"
                      >
                        {row.active ? '⏸' : '▶'}
                      </button>
                      <button
                        aria-label={`Excluir ${row.description}`}
                        className="icon-button"
                        disabled={busy}
                        onClick={() => void remove(row)}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
