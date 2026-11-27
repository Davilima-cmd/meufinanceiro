import { monthBounds, shiftMonth, todayISO } from './format';
import type { FinanceSnapshot, FinanceTransaction, FinanceUser, TransactionType } from './types';

/**
 * Dados de demonstração do casal (fictícios).
 *
 * O gerador é determinístico: a mesma sessão sempre recebe os mesmos valores,
 * o que mantém a renderização do servidor e do cliente idêntica (sem
 * "hydration mismatch") e torna os testes previsíveis.
 */

export const DEMO_USER: FinanceUser = {
  id: 'demo-user',
  name: 'Davi Lima',
  email: 'davi@demonstracao.app',
};

export const DEMO_PARTNER = {
  id: 'demo-partner',
  name: 'Ana Souza',
  email: 'ana@demonstracao.app',
};

const DEMO_OWNER_ID = DEMO_USER.id;
const DEMO_PARTNER_ID = DEMO_PARTNER.id;

/** PRNG linear congruencial simples (determinístico). */
function createRandom(seed: number) {
  let state = seed % 2_147_483_647;
  if (state <= 0) state += 2_147_483_646;
  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

type Template = {
  description: string;
  categoryId: string;
  accountId: string;
  /** Valor base em centavos (negativo = despesa). */
  baseCents: number;
  type: TransactionType;
  /** Dia preferencial do mês. */
  day: number;
  /** Variação máxima em centavos (aplicada de forma determinística). */
  jitter?: number;
  origin?: 'manual' | 'imported';
};

const CATEGORY_IDS = {
  moradia: 'cat-moradia',
  mercado: 'cat-mercado',
  restaurante: 'cat-restaurante',
  transporte: 'cat-transporte',
  saude: 'cat-saude',
  lazer: 'cat-lazer',
  educacao: 'cat-educacao',
  assinaturas: 'cat-assinaturas',
  compras: 'cat-compras',
  pets: 'cat-pets',
  salario: 'cat-salario',
  freelance: 'cat-freelance',
  rendimentos: 'cat-rendimentos',
  transferencia: 'cat-transferencia',
};

const CASH = 'acc-carteira';
export const DEMO_ACCOUNT_IDS = {
  checking: 'acc-corrente',
  savings: 'acc-reserva',
  shared: 'acc-compartilhada',
  credit: 'acc-cartao',
  cash: CASH,
};

const TEMPLATES: Template[] = [
  {
    description: 'Salário',
    categoryId: CATEGORY_IDS.salario,
    accountId: DEMO_ACCOUNT_IDS.checking,
    baseCents: 825_000,
    type: 'income',
    day: 5,
  },
  {
    description: 'Salário Ana',
    categoryId: CATEGORY_IDS.salario,
    accountId: DEMO_ACCOUNT_IDS.shared,
    baseCents: 640_000,
    type: 'income',
    day: 5,
  },
  {
    description: 'Aluguel',
    categoryId: CATEGORY_IDS.moradia,
    accountId: DEMO_ACCOUNT_IDS.shared,
    baseCents: -185_000,
    type: 'expense',
    day: 7,
  },
  {
    description: 'Condomínio',
    categoryId: CATEGORY_IDS.moradia,
    accountId: DEMO_ACCOUNT_IDS.shared,
    baseCents: -48_000,
    type: 'expense',
    day: 8,
  },
  {
    description: 'Energia elétrica',
    categoryId: CATEGORY_IDS.moradia,
    accountId: DEMO_ACCOUNT_IDS.shared,
    baseCents: -21_400,
    type: 'expense',
    day: 12,
    jitter: 4_000,
  },
  {
    description: 'Internet fibra',
    categoryId: CATEGORY_IDS.moradia,
    accountId: DEMO_ACCOUNT_IDS.shared,
    baseCents: -11_990,
    type: 'expense',
    day: 10,
  },
  {
    description: 'Mercado do bairro',
    categoryId: CATEGORY_IDS.mercado,
    accountId: DEMO_ACCOUNT_IDS.shared,
    baseCents: -38_500,
    type: 'expense',
    day: 4,
    jitter: 9_000,
    origin: 'imported',
  },
  {
    description: 'Feira semanal',
    categoryId: CATEGORY_IDS.mercado,
    accountId: DEMO_ACCOUNT_IDS.checking,
    baseCents: -16_800,
    type: 'expense',
    day: 11,
    jitter: 5_000,
  },
  {
    description: 'Padaria',
    categoryId: CATEGORY_IDS.mercado,
    accountId: CASH,
    baseCents: -4_250,
    type: 'expense',
    day: 16,
    jitter: 2_000,
  },
  {
    description: 'Restaurante japonês',
    categoryId: CATEGORY_IDS.restaurante,
    accountId: DEMO_ACCOUNT_IDS.credit,
    baseCents: -19_900,
    type: 'expense',
    day: 19,
    jitter: 6_000,
  },
  {
    description: 'Cafeteria',
    categoryId: CATEGORY_IDS.restaurante,
    accountId: DEMO_ACCOUNT_IDS.credit,
    baseCents: -3_450,
    type: 'expense',
    day: 22,
    jitter: 1_500,
  },
  {
    description: 'Combustível',
    categoryId: CATEGORY_IDS.transporte,
    accountId: DEMO_ACCOUNT_IDS.checking,
    baseCents: -24_000,
    type: 'expense',
    day: 14,
    jitter: 5_000,
  },
  {
    description: 'Aplicativo de transporte',
    categoryId: CATEGORY_IDS.transporte,
    accountId: DEMO_ACCOUNT_IDS.credit,
    baseCents: -6_700,
    type: 'expense',
    day: 24,
    jitter: 3_000,
  },
  {
    description: 'Academia',
    categoryId: CATEGORY_IDS.saude,
    accountId: DEMO_ACCOUNT_IDS.checking,
    baseCents: -12_900,
    type: 'expense',
    day: 6,
  },
  {
    description: 'Farmácia',
    categoryId: CATEGORY_IDS.saude,
    accountId: DEMO_ACCOUNT_IDS.credit,
    baseCents: -8_400,
    type: 'expense',
    day: 17,
    jitter: 3_500,
  },
  {
    description: 'Streaming de filmes',
    categoryId: CATEGORY_IDS.assinaturas,
    accountId: DEMO_ACCOUNT_IDS.credit,
    baseCents: -5_590,
    type: 'expense',
    day: 3,
  },
  {
    description: 'Música Premium',
    categoryId: CATEGORY_IDS.assinaturas,
    accountId: DEMO_ACCOUNT_IDS.credit,
    baseCents: -2_190,
    type: 'expense',
    day: 3,
  },
  {
    description: 'Curso de inglês',
    categoryId: CATEGORY_IDS.educacao,
    accountId: DEMO_ACCOUNT_IDS.checking,
    baseCents: -34_900,
    type: 'expense',
    day: 9,
  },
  {
    description: 'Cinema',
    categoryId: CATEGORY_IDS.lazer,
    accountId: DEMO_ACCOUNT_IDS.credit,
    baseCents: -7_800,
    type: 'expense',
    day: 21,
    jitter: 2_500,
  },
  {
    description: 'Praia no fim de semana',
    categoryId: CATEGORY_IDS.lazer,
    accountId: DEMO_ACCOUNT_IDS.shared,
    baseCents: -13_600,
    type: 'expense',
    day: 26,
    jitter: 4_000,
  },
  {
    description: 'Ração e banho do Thor',
    categoryId: CATEGORY_IDS.pets,
    accountId: DEMO_ACCOUNT_IDS.checking,
    baseCents: -14_200,
    type: 'expense',
    day: 15,
    jitter: 3_000,
  },
  {
    description: 'Loja de roupas',
    categoryId: CATEGORY_IDS.compras,
    accountId: DEMO_ACCOUNT_IDS.credit,
    baseCents: -25_900,
    type: 'expense',
    day: 27,
    jitter: 12_000,
  },
  {
    description: 'Projeto freelance',
    categoryId: CATEGORY_IDS.freelance,
    accountId: DEMO_ACCOUNT_IDS.checking,
    baseCents: 145_000,
    type: 'income',
    day: 18,
    jitter: 45_000,
  },
  {
    description: 'Rendimento da reserva',
    categoryId: CATEGORY_IDS.rendimentos,
    accountId: DEMO_ACCOUNT_IDS.savings,
    baseCents: 32_400,
    type: 'income',
    day: 28,
    jitter: 6_000,
  },
  {
    description: 'Aporte na reserva',
    categoryId: CATEGORY_IDS.transferencia,
    accountId: DEMO_ACCOUNT_IDS.savings,
    baseCents: -60_000,
    type: 'transfer',
    day: 6,
  },
];

function monthDays(monthKey: string): number {
  const { end } = monthBounds(monthKey);
  return Number(end.slice(8, 10));
}

function isoDate(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, '0')}`;
}

export function buildDemoSnapshot(today = todayISO()): FinanceSnapshot {
  const currentMonthKey = today.slice(0, 7);
  const currentDay = Number(today.slice(8, 10));
  const transactions: FinanceTransaction[] = [];
  const random = createRandom(20_261_125);

  for (let monthOffset = 5; monthOffset >= 0; monthOffset -= 1) {
    const monthKey = shiftMonth(currentMonthKey, -monthOffset);
    const maxDay = monthDays(monthKey);

    for (const template of TEMPLATES) {
      if (monthOffset === 0 && template.day > currentDay) continue;
      const jitter = template.jitter ?? 0;
      const delta = jitter > 0 ? Math.round((random() * 2 - 1) * jitter) : 0;
      const raw = template.baseCents + delta;
      const amountCents = template.baseCents < 0 ? -Math.abs(raw) : Math.abs(raw);
      const day = Math.min(template.day, maxDay);

      transactions.push({
        id: `tx-${monthKey}-${template.accountId}-${template.day}-${template.categoryId}`,
        accountId: template.accountId,
        categoryId: template.categoryId,
        description: template.description,
        amountCents: String(amountCents),
        type: template.type,
        origin: template.origin ?? 'manual',
        date: isoDate(monthKey, day),
        createdAt: `${isoDate(monthKey, day)}T12:00:00.000Z`,
      });
    }
  }

  const { start, end } = monthBounds(currentMonthKey);

  return {
    accounts: [
      {
        id: DEMO_ACCOUNT_IDS.checking,
        name: 'Conta corrente',
        institution: 'Nubank',
        type: 'checking',
        currency: 'BRL',
        balanceCents: '845060',
        shareLevel: 'private',
        ownerId: DEMO_OWNER_ID,
        ownerName: DEMO_USER.name,
        color: '#7c5cff',
        isActive: true,
      },
      {
        id: DEMO_ACCOUNT_IDS.savings,
        name: 'Reserva de emergência',
        institution: 'Tesouro Selic',
        type: 'investment',
        currency: 'BRL',
        balanceCents: '3218900',
        shareLevel: 'BALANCE_ONLY',
        ownerId: DEMO_OWNER_ID,
        ownerName: DEMO_USER.name,
        color: '#22c55e',
        isActive: true,
      },
      {
        id: DEMO_ACCOUNT_IDS.shared,
        name: 'Conta da casa',
        institution: 'Bradesco',
        type: 'checking',
        currency: 'BRL',
        balanceCents: '412380',
        shareLevel: 'FULL',
        ownerId: DEMO_PARTNER_ID,
        ownerName: DEMO_PARTNER.name,
        color: '#0ea5e9',
        isActive: true,
      },
      {
        id: DEMO_ACCOUNT_IDS.credit,
        name: 'Cartão de crédito',
        institution: 'Nubank',
        type: 'credit',
        currency: 'BRL',
        balanceCents: '-186430',
        shareLevel: 'BALANCE_ONLY',
        ownerId: DEMO_OWNER_ID,
        ownerName: DEMO_USER.name,
        color: '#f97316',
        isActive: true,
      },
      {
        id: CASH,
        name: 'Carteira',
        institution: null,
        type: 'cash',
        currency: 'BRL',
        balanceCents: '32750',
        shareLevel: 'BALANCE_ONLY',
        ownerId: DEMO_PARTNER_ID,
        ownerName: DEMO_PARTNER.name,
        color: '#eab308',
        isActive: true,
      },
    ],
    categories: [
      {
        id: CATEGORY_IDS.moradia,
        name: 'Moradia',
        color: '#6366f1',
        isSystem: true,
        kind: 'expense',
      },
      {
        id: CATEGORY_IDS.mercado,
        name: 'Mercado',
        color: '#22c55e',
        isSystem: true,
        kind: 'expense',
      },
      {
        id: CATEGORY_IDS.restaurante,
        name: 'Restaurantes',
        color: '#f97316',
        isSystem: true,
        kind: 'expense',
      },
      {
        id: CATEGORY_IDS.transporte,
        name: 'Transporte',
        color: '#0ea5e9',
        isSystem: true,
        kind: 'expense',
      },
      { id: CATEGORY_IDS.saude, name: 'Saúde', color: '#14b8a6', isSystem: true, kind: 'expense' },
      { id: CATEGORY_IDS.lazer, name: 'Lazer', color: '#ec4899', isSystem: true, kind: 'expense' },
      {
        id: CATEGORY_IDS.educacao,
        name: 'Educação',
        color: '#a855f7',
        isSystem: true,
        kind: 'expense',
      },
      {
        id: CATEGORY_IDS.assinaturas,
        name: 'Assinaturas',
        color: '#f43f5e',
        isSystem: true,
        kind: 'expense',
      },
      {
        id: CATEGORY_IDS.compras,
        name: 'Compras',
        color: '#eab308',
        isSystem: true,
        kind: 'expense',
      },
      { id: CATEGORY_IDS.pets, name: 'Pets', color: '#84cc16', isSystem: true, kind: 'expense' },
      {
        id: CATEGORY_IDS.salario,
        name: 'Salário',
        color: '#10b981',
        isSystem: true,
        kind: 'income',
      },
      {
        id: CATEGORY_IDS.freelance,
        name: 'Freelance',
        color: '#34d399',
        isSystem: true,
        kind: 'income',
      },
      {
        id: CATEGORY_IDS.rendimentos,
        name: 'Rendimentos',
        color: '#2dd4bf',
        isSystem: true,
        kind: 'income',
      },
      {
        id: CATEGORY_IDS.transferencia,
        name: 'Transferências',
        color: '#94a3b8',
        isSystem: true,
        kind: 'both',
      },
    ],
    transactions,
    budgets: [
      {
        id: 'bud-1',
        categoryId: CATEGORY_IDS.mercado,
        amountCents: '180000',
        periodStart: start,
        periodEnd: end,
      },
      {
        id: 'bud-2',
        categoryId: CATEGORY_IDS.restaurante,
        amountCents: '60000',
        periodStart: start,
        periodEnd: end,
      },
      {
        id: 'bud-3',
        categoryId: CATEGORY_IDS.lazer,
        amountCents: '45000',
        periodStart: start,
        periodEnd: end,
      },
      {
        id: 'bud-4',
        categoryId: CATEGORY_IDS.transporte,
        amountCents: '50000',
        periodStart: start,
        periodEnd: end,
      },
      {
        id: 'bud-5',
        categoryId: CATEGORY_IDS.compras,
        amountCents: '80000',
        periodStart: start,
        periodEnd: end,
      },
      {
        id: 'bud-6',
        categoryId: CATEGORY_IDS.assinaturas,
        amountCents: '9000',
        periodStart: start,
        periodEnd: end,
      },
    ],
    goals: [
      {
        id: 'goal-1',
        name: 'Viagem para Jericoacoara',
        targetCents: '900000',
        currentCents: '615000',
        dueDate: `${shiftMonth(currentMonthKey, 5)}-15`,
      },
      {
        id: 'goal-2',
        name: 'Reserva de 12 meses',
        targetCents: '4800000',
        currentCents: '3218900',
        dueDate: `${shiftMonth(currentMonthKey, 10)}-01`,
      },
      {
        id: 'goal-3',
        name: 'Notebook novo',
        targetCents: '750000',
        currentCents: '240000',
        dueDate: `${shiftMonth(currentMonthKey, 3)}-20`,
      },
    ],
    partner: {
      id: DEMO_PARTNER.id,
      name: DEMO_PARTNER.name,
      email: DEMO_PARTNER.email,
      status: 'accepted',
    },
    // Patrimônio fora das contas: o dado de demonstração também mostra a
    // dívida, senão a tela de patrimônio nasceria vazia.
    netWorthItems: [
      { id: 'nw-car', name: 'Carro', kind: 'asset', valueCents: '4800000', note: 'Onix 2022' },
      {
        id: 'nw-loan',
        name: 'Financiamento do carro',
        kind: 'liability',
        valueCents: '3150000',
        note: '24 parcelas restantes',
      },
      {
        id: 'nw-reserve',
        name: 'Reserva de emergência (CDB)',
        kind: 'asset',
        valueCents: '1200000',
        note: null,
      },
    ],
    settings: {
      theme: 'light',
      hideValues: false,
      partnerName: DEMO_PARTNER.name,
    },
  };
}

/**
 * Snapshot **vazio** para sessão de API.
 *
 * O app precisava de um estado inicial determinístico (servidor e cliente
 * renderizam o mesmo HTML), e o caminho escolhido foi começar com os dados de
 * demonstração. Isso vazou para produção: ao entrar na conta, a tela mostrava
 * "Olá, Davi! R$ 34.776,00 · Ana Souza também usa este painel" enquanto a API
 * carregava — e continuava mostrando para sempre se `fetchApiSnapshot` falhasse.
 *
 * Aqui o conteúdo fictício some: contas, lançamentos, metas e parceiro ficam
 * vazios, e só as categorias do sistema permanecem (são o vocabulário real,
 * igual ao que `seed.ts` cria no banco).
 */
export function buildEmptySnapshot(): FinanceSnapshot {
  return {
    accounts: [],
    categories: [
      {
        id: 'csys_alimentacao',
        name: 'Alimentação',
        color: '#EF4444',
        isSystem: true,
        kind: 'expense',
      },
      {
        id: 'csys_transporte',
        name: 'Transporte',
        color: '#3B82F6',
        isSystem: true,
        kind: 'expense',
      },
      { id: 'csys_moradia', name: 'Moradia', color: '#8B5CF6', isSystem: true, kind: 'expense' },
      { id: 'csys_saude', name: 'Saúde', color: '#10B981', isSystem: true, kind: 'expense' },
      { id: 'csys_educacao', name: 'Educação', color: '#F59E0B', isSystem: true, kind: 'expense' },
      { id: 'csys_lazer', name: 'Lazer', color: '#EC4899', isSystem: true, kind: 'expense' },
      { id: 'csys_salario', name: 'Salário', color: '#22C55E', isSystem: true, kind: 'income' },
      {
        id: 'csys_outras_receitas',
        name: 'Outras receitas',
        color: '#6B7280',
        isSystem: true,
        kind: 'income',
      },
    ],
    transactions: [],
    budgets: [],
    goals: [],
    partner: null,
    netWorthItems: [],
    invites: [],
    settings: { theme: 'light', hideValues: false, partnerName: '' },
  };
}
