import { daysUntil, todayISO } from '@/lib/format';
import type { FinanceTransaction } from '@/lib/types';

/**
 * Contas a pagar/receber.
 *
 * Um lançamento `pending` é uma promessa: entra na lista de vencimentos e não
 * no saldo. A classificação abaixo é o que a tela usa para responder "o que
 * vence hoje, o que já atrasou e o que vem por aí" — e é também o que alimenta
 * o lembrete no topo do painel.
 */

/** Quantos dias antes do vencimento o lembrete aparece. */
export const REMINDER_WINDOW_DAYS = 3;

export type BillingBucket = 'overdue' | 'due-today' | 'soon' | 'upcoming';

export type BillingItem = {
  transaction: FinanceTransaction;
  /** Data usada no vencimento: `dueDate` ou, na falta, a data de competência. */
  dueDate: string;
  days: number;
  bucket: BillingBucket;
  /** Positivo entra, negativo sai — só para rótulo e cor. */
  isIncome: boolean;
};

export function billingDueDate(transaction: FinanceTransaction): string {
  return (transaction.dueDate ?? transaction.date).slice(0, 10);
}

export function billingBucket(days: number): BillingBucket {
  if (days < 0) return 'overdue';
  if (days === 0) return 'due-today';
  if (days <= REMINDER_WINDOW_DAYS) return 'soon';
  return 'upcoming';
}

/**
 * Vencimentos pendentes, do mais urgente para o mais distante.
 *
 * Cancelados e liquidados ficam de fora: o que já foi pago não precisa de
 * lembrete, e cancelado não é dívida.
 */
export function billingItems(
  transactions: FinanceTransaction[],
  today = todayISO()
): BillingItem[] {
  return transactions
    .filter((transaction) => transaction.status === 'pending')
    .map((transaction) => {
      const dueDate = billingDueDate(transaction);
      const days = daysUntil(dueDate, today);
      return {
        transaction,
        dueDate,
        days,
        bucket: billingBucket(days),
        isIncome: (transaction.amountCents ?? '0').trim().startsWith('-') === false,
      };
    })
    .sort((left, right) => left.days - right.days || left.dueDate.localeCompare(right.dueDate));
}

export type BillingSummary = {
  overdueCents: bigint;
  dueTodayCents: bigint;
  soonCents: bigint;
  /** Tudo o que ainda não foi pago, em módulo (despesas e receitas misturadas). */
  pendingCents: bigint;
  /** Só o que precisa de atenção agora: atrasado + vence hoje. */
  urgentCents: bigint;
  overdueCount: number;
  dueTodayCount: number;
  soonCount: number;
};

/** Soma em módulo: R$ 100 a pagar e R$ 100 a receber não se anulam no alerta. */
export function billingSummary(items: BillingItem[]): BillingSummary {
  const summary: BillingSummary = {
    overdueCents: 0n,
    dueTodayCents: 0n,
    soonCents: 0n,
    pendingCents: 0n,
    urgentCents: 0n,
    overdueCount: 0,
    dueTodayCount: 0,
    soonCount: 0,
  };

  for (const item of items) {
    const cents = absoluteCents(item.transaction.amountCents);
    summary.pendingCents += cents;
    if (item.bucket === 'overdue') {
      summary.overdueCents += cents;
      summary.overdueCount += 1;
    } else if (item.bucket === 'due-today') {
      summary.dueTodayCents += cents;
      summary.dueTodayCount += 1;
    } else if (item.bucket === 'soon') {
      summary.soonCents += cents;
      summary.soonCount += 1;
    }
  }

  summary.urgentCents = summary.overdueCents + summary.dueTodayCents;
  return summary;
}

function absoluteCents(value: string | undefined): bigint {
  const cents = BigInt((value ?? '0').trim() || '0');
  return cents < 0n ? -cents : cents;
}

/** Texto do lembrete, ou `null` quando não há nada urgente. */
export function reminderText(summary: BillingSummary): string | null {
  if (summary.overdueCount > 0 && summary.dueTodayCount > 0) {
    return `${summary.overdueCount} conta(s) atrasada(s) e ${summary.dueTodayCount} vencendo hoje.`;
  }
  if (summary.overdueCount > 0) {
    return `${summary.overdueCount} conta(s) atrasada(s) esperando pagamento.`;
  }
  if (summary.dueTodayCount > 0) {
    return `${summary.dueTodayCount} conta(s) vencem hoje.`;
  }
  if (summary.soonCount > 0) {
    return `${summary.soonCount} conta(s) vencem nos próximos ${REMINDER_WINDOW_DAYS} dias.`;
  }
  return null;
}
