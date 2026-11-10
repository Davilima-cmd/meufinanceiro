export type DemoTransaction = {
  id: string;
  description: string;
  category: string;
  account: string;
  date: string;
  amountCents: bigint;
};

export const demoMonthly = {
  incomeCents: 825000n,
  expensesCents: 225872n,
  availableCents: 599128n,
  personalBalanceCents: 1482560n,
  jointBalanceCents: 2841230n,
};

export const demoTransactions: DemoTransaction[] = [
  {
    id: 'tx-1',
    description: 'Mercado do bairro',
    category: 'Alimentação',
    account: 'Conta principal',
    date: '10 nov · 11:42',
    amountCents: -182450n,
  },
  {
    id: 'tx-2',
    description: 'Salário',
    category: 'Receita',
    account: 'Conta principal',
    date: '10 nov · 08:15',
    amountCents: 825000n,
  },
  {
    id: 'tx-3',
    description: 'Conta de energia',
    category: 'Moradia',
    account: 'Conta principal',
    date: '09 nov · 16:20',
    amountCents: -14782n,
  },
  {
    id: 'tx-4',
    description: 'Restaurante',
    category: 'Alimentação',
    account: 'Conta compartilhada',
    date: '08 nov · 20:05',
    amountCents: -7430n,
  },
  {
    id: 'tx-5',
    description: 'Internet fibra',
    category: 'Moradia',
    account: 'Conta principal',
    date: '07 nov · 10:30',
    amountCents: -10990n,
  },
  {
    id: 'tx-6',
    description: 'Transporte',
    category: 'Transporte',
    account: 'Conta compartilhada',
    date: '06 nov · 18:12',
    amountCents: -5890n,
  },
  {
    id: 'tx-7',
    description: 'Farmácia',
    category: 'Saúde',
    account: 'Conta principal',
    date: '05 nov · 13:02',
    amountCents: -4330n,
  },
];

export const demoAccounts = [
  {
    id: 'account-1',
    name: 'Conta principal',
    institution: 'Instituição demonstrativa',
    balanceCents: 1245000n,
    share: 'Privada',
    detail: 'Só você tem acesso',
  },
  {
    id: 'account-2',
    name: 'Conta compartilhada',
    institution: 'Instituição demonstrativa',
    balanceCents: 0n,
    share: 'Acesso completo',
    detail: 'Compartilhada com Pessoa 2',
  },
  {
    id: 'account-3',
    name: 'Reserva manual',
    institution: 'Carteira manual',
    balanceCents: 237560n,
    share: 'Privada',
    detail: 'Saldo atualizado manualmente',
  },
] as const;

export const demoCategories = [
  { name: 'Alimentação', amountCents: 189880n, percent: 84 },
  { name: 'Moradia', amountCents: 25772n, percent: 11 },
  { name: 'Transporte', amountCents: 5890n, percent: 3 },
  { name: 'Saúde', amountCents: 4330n, percent: 2 },
] as const;

export const demoTrend = [
  { month: 'Jun', height: 38 },
  { month: 'Jul', height: 46 },
  { month: 'Ago', height: 43 },
  { month: 'Set', height: 62 },
  { month: 'Out', height: 74 },
  { month: 'Nov', height: 88 },
] as const;
