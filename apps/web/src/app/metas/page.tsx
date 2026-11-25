'use client';

import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { DateField } from '@/components/date-field';
import { useDialog } from '@/components/dialog';
import { Badge, Card, EmptyState, Money, PageHeader, ProgressBar } from '@/components/ui';
import { centsFromInput, daysUntil, formatBRL, toCents, todayISO } from '@/lib/format';
import { useFinance } from '@/lib/store';

export default function GoalsPage() {
  const { snapshot, addGoal, contributeGoal, deleteGoal } = useFinance();
  const dialog = useDialog();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [contributions, setContributions] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Dê um nome à meta.');
      return;
    }
    const cents = centsFromInput(target);
    if (cents <= 0n) {
      setError('Informe um valor alvo maior que zero.');
      return;
    }
    const failure = await addGoal({
      name,
      targetCents: cents.toString(),
      dueDate: dueDate || null,
    });
    if (failure) {
      setError(failure);
      return;
    }
    setName('');
    setTarget('');
    setDueDate('');
  }

  const totalTarget = snapshot.goals.reduce((sum, goal) => sum + toCents(goal.targetCents), 0n);
  const totalSaved = snapshot.goals.reduce((sum, goal) => sum + toCents(goal.currentCents), 0n);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Objetivos"
        title="Metas financeiras"
        description="Junte dinheiro com propósito: viagens, reserva de emergência, compras planejadas."
      />

      <div className="stack">
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">Total das metas</span>
            <strong className="stat-value">
              <Money value={totalTarget} />
            </strong>
            <span className="stat-hint">{snapshot.goals.length} meta(s)</span>
          </div>
          <div className="stat">
            <span className="stat-label">Já guardado</span>
            <strong className="stat-value is-positive">
              <Money value={totalSaved} />
            </strong>
          </div>
          <div className="stat">
            <span className="stat-label">Falta guardar</span>
            <strong className="stat-value">
              <Money value={totalTarget - totalSaved} />
            </strong>
          </div>
        </div>

        {snapshot.goals.length === 0 ? (
          <EmptyState
            description="Crie a primeira meta e registre aportes ao longo do tempo."
            title="Nenhuma meta cadastrada"
          />
        ) : (
          <div className="goal-grid">
            {snapshot.goals.map((goal) => {
              const target = toCents(goal.targetCents);
              const current = toCents(goal.currentCents);
              const percent =
                target > 0n ? Math.round((Number(current) / Number(target)) * 100) : 0;
              const remaining = target - current;
              const days = goal.dueDate ? daysUntil(goal.dueDate) : null;
              return (
                <article className="goal-card" key={goal.id}>
                  <div className="goal-head">
                    <div>
                      <strong style={{ fontSize: 14.5 }}>{goal.name}</strong>
                      <div className="account-sub">
                        {goal.dueDate
                          ? days !== null && days >= 0
                            ? `Prazo em ${days} dia(s)`
                            : 'Prazo vencido'
                          : 'Sem prazo definido'}
                      </div>
                    </div>
                    <Badge
                      tone={percent >= 100 ? 'positive' : percent >= 60 ? 'accent' : 'neutral'}
                    >
                      {percent}%
                    </Badge>
                  </div>
                  <ProgressBar percent={percent} tone={percent >= 100 ? 'positive' : undefined} />
                  <div className="goal-amounts">
                    <strong>
                      <Money value={goal.currentCents} />
                    </strong>
                    de <Money value={goal.targetCents} />
                  </div>
                  <span className="account-sub">
                    {remaining > 0n
                      ? `Faltam ${formatBRL(remaining)}`
                      : 'Meta atingida — parabéns!'}
                  </span>
                  <div className="goal-actions">
                    <input
                      aria-label={`Aporte para ${goal.name}`}
                      className="input"
                      inputMode="decimal"
                      onChange={(event) =>
                        setContributions((current) => ({
                          ...current,
                          [goal.id]: event.target.value,
                        }))
                      }
                      placeholder="Aporte R$"
                      value={contributions[goal.id] ?? ''}
                    />
                    <button
                      className="button button-ghost"
                      onClick={() => {
                        const value = centsFromInput(contributions[goal.id] ?? '');
                        if (value <= 0n) return;
                        void contributeGoal(goal.id, value.toString()).then((failure) => {
                          if (failure) setError(failure);
                        });
                        setContributions((current) => ({ ...current, [goal.id]: '' }));
                      }}
                      type="button"
                    >
                      Guardar
                    </button>
                    <button
                      aria-label={`Excluir ${goal.name}`}
                      className="icon-button"
                      onClick={async () => {
                        const confirmed = await dialog.confirm({
                          title: `Excluir a meta “${goal.name}”?`,
                          description:
                            'O valor já guardado não volta para nenhuma conta — ajuste o saldo manualmente se precisar.',
                          confirmLabel: 'Excluir meta',
                        });
                        if (!confirmed) return;
                        void deleteGoal(goal.id).then((failure) => {
                          if (failure) setError(failure);
                        });
                      }}
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <Card>
          <div className="card-heading">
            <div>
              <h2>Nova meta</h2>
              <p>Defina o objetivo e o prazo desejado</p>
            </div>
          </div>
          <form className="form-row" onSubmit={handleSubmit}>
            <label className="field">
              <span>Nome da meta</span>
              <input
                className="input"
                onChange={(event) => setName(event.target.value)}
                placeholder="Viagem para Jericoacoara"
                value={name}
              />
            </label>
            <label className="field">
              <span>Valor alvo</span>
              <input
                className="input"
                inputMode="decimal"
                onChange={(event) => setTarget(event.target.value)}
                placeholder="9.000,00"
                value={target}
              />
            </label>
            <div className="field">
              <span>Prazo (opcional)</span>
              <DateField
                allowClear
                clearLabel="Sem prazo"
                label="Prazo da meta"
                min={todayISO()}
                onChange={setDueDate}
                placeholder="Sem prazo"
                value={dueDate}
              />
            </div>
            <button className="button button-primary" type="submit">
              Criar meta
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
