export const demoAccounts = [
  {
    name: 'Conta do dia a dia',
    institution: 'Banco Horizonte · fictício',
    kind: 'Conta corrente',
    owner: 'Minha conta',
    sharing: 'Privada',
    balanceCents: 527840n,
  },
  {
    name: 'Reserva tranquila',
    institution: 'Cooperativa Aurora · fictícia',
    kind: 'Carteira manual',
    owner: 'Minha conta',
    sharing: 'Privada',
    balanceCents: 680000n,
  },
  {
    name: 'Reserva compartilhada',
    institution: 'Banco Horizonte · fictício',
    kind: 'Conta poupança',
    owner: 'Conta da parceira',
    sharing: 'BALANCE_ONLY',
    balanceCents: 195000n,
  },
];

export const demoTransactions = [
  { title: 'Mercado da semana', category: 'Alimentação', date: '31 out', amountCents: -6842n },
  { title: 'Salário', category: 'Salário', date: '30 out', amountCents: 642000n },
  {
    title: 'Transporte por aplicativo',
    category: 'Transporte',
    date: '29 out',
    amountCents: -3240n,
  },
  { title: 'Conta de energia', category: 'Moradia', date: '28 out', amountCents: -15890n },
  { title: 'Farmácia', category: 'Saúde', date: '27 out', amountCents: -4325n },
];

export const demoCategories = [
  { name: 'Moradia', amountCents: 148000n, percent: 76 },
  { name: 'Alimentação', amountCents: 96300n, percent: 62 },
  { name: 'Transporte', amountCents: 52400n, percent: 48 },
  { name: 'Saúde', amountCents: 31600n, percent: 37 },
];

export function formatBRL(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '- ' : ''}R$ ${whole},${fraction}`;
}
