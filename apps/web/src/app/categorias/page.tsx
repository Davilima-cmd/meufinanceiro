'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Select, useDialog } from '@/components/dialog';
import { Badge, Card, Money, PageHeader } from '@/components/ui';
import { spentByCategory } from '@/lib/analytics';
import { currentMonthKey, formatMonth } from '@/lib/format';
import { useFinance } from '@/lib/store';
import type { FinanceCategory } from '@/lib/types';

const COLOR_OPTIONS = [
  '#8b7bff',
  '#22c55e',
  '#f97316',
  '#0ea5e9',
  '#ec4899',
  '#eab308',
  '#14b8a6',
  '#f43f5e',
];

export default function CategoriesPage() {
  const { snapshot, session, addCategory, deleteCategory } = useFinance();
  const dialog = useDialog();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [kind, setKind] = useState<FinanceCategory['kind']>('expense');
  const [error, setError] = useState('');

  const ownerId = session?.user.id ?? '';
  const monthKey = currentMonthKey();
  const spent = useMemo(
    () => spentByCategory(snapshot, monthKey, ownerId),
    [snapshot, monthKey, ownerId]
  );

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of snapshot.transactions) {
      if (!transaction.categoryId) continue;
      counts.set(transaction.categoryId, (counts.get(transaction.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.transactions]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Dê um nome à categoria.');
      return;
    }
    if (
      snapshot.categories.some((category) => category.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      setError('Já existe uma categoria com esse nome.');
      return;
    }
    addCategory({ name: trimmed, color, kind });
    setName('');
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organização"
        title="Categorias"
        description="Classifique lançamentos para alimentar orçamentos e relatórios."
      />

      <div className="stack">
        <Card>
          <div className="card-heading">
            <div>
              <h2>Suas categorias</h2>
              <p>Gasto de {formatMonth(monthKey)} e quantidade de lançamentos</p>
            </div>
            <Badge tone="neutral">{snapshot.categories.length} categorias</Badge>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Tipo</th>
                  <th className="num">Gasto no mês</th>
                  <th className="num">Lançamentos</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {snapshot.categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <span className="legend-name">
                        <i className="dot-color" style={{ background: category.color }} />
                        <span>{category.name}</span>
                      </span>
                    </td>
                    <td>
                      {category.kind === 'income' ? (
                        <Badge tone="positive">receita</Badge>
                      ) : category.kind === 'both' ? (
                        <Badge tone="neutral">ambos</Badge>
                      ) : (
                        <Badge tone="neutral">despesa</Badge>
                      )}
                      {category.isSystem ? <Badge tone="accent">sistema</Badge> : null}
                    </td>
                    <td className="num">
                      <Money value={spent.get(category.id) ?? 0n} />
                    </td>
                    <td className="num">{usage.get(category.id) ?? 0}</td>
                    <td className="num">
                      {category.isSystem ? (
                        <span className="account-sub">—</span>
                      ) : (
                        <button
                          aria-label={`Excluir ${category.name}`}
                          className="icon-button"
                          onClick={async () => {
                            const confirmed = await dialog.confirm({
                              title: `Excluir “${category.name}”?`,
                              description:
                                'Os lançamentos que usam esta categoria continuam existindo, mas ficam sem categoria.',
                              confirmLabel: 'Excluir categoria',
                            });
                            if (confirmed) deleteCategory(category.id);
                          }}
                          type="button"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Nova categoria</h2>
              <p>Escolha cor e tipo para melhorar os relatórios</p>
            </div>
          </div>
          <form className="form-row" onSubmit={handleSubmit}>
            <label className="field">
              <span>Nome</span>
              <input
                className="input"
                onChange={(event) => setName(event.target.value)}
                placeholder="Assinaturas"
                value={name}
              />
            </label>
            <div className="field">
              <span>Tipo</span>
              <Select
                label="Tipo da categoria"
                onChange={(next) => setKind(next as FinanceCategory['kind'])}
                options={[
                  { value: 'expense', label: 'Despesa' },
                  { value: 'income', label: 'Receita' },
                  { value: 'both', label: 'Ambos' },
                ]}
                value={kind}
              />
            </div>
            <div className="field">
              <span>Cor</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {COLOR_OPTIONS.map((option) => (
                  <button
                    aria-label={`Cor ${option}`}
                    aria-pressed={color === option}
                    key={option}
                    onClick={() => setColor(option)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      border: color === option ? '2px solid var(--text)' : '1px solid transparent',
                      background: option,
                    }}
                    type="button"
                  />
                ))}
              </div>
            </div>
            <button className="button button-primary" type="submit">
              Criar categoria
            </button>
          </form>
          {error ? (
            <p className="form-error" style={{ marginTop: 12 }}>
              {error}
            </p>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}
