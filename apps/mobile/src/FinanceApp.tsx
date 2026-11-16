import { cornerRadius, spacing, themes } from '@meufinanceiro/design-tokens';
import { formatCents } from '@meufinanceiro/shared-types';
import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

type Screen = 'home' | 'transactions' | 'accounts' | 'analysis' | 'profile';
type ThemeName = 'light' | 'dark';
type Filter = 'all' | 'income' | 'expense';
type Palette = (typeof themes)[keyof typeof themes];

type DemoTransaction = {
  id: string;
  description: string;
  category: string;
  date: string;
  amountCents: bigint;
};

const transactions: DemoTransaction[] = [
  {
    id: '1',
    description: 'Mercado do bairro',
    category: 'Alimentação',
    date: '10 nov · 11:42',
    amountCents: -182450n,
  },
  {
    id: '2',
    description: 'Salário',
    category: 'Receita',
    date: '10 nov · 08:15',
    amountCents: 825000n,
  },
  {
    id: '3',
    description: 'Conta de energia',
    category: 'Moradia',
    date: '09 nov · 16:20',
    amountCents: -14782n,
  },
  {
    id: '4',
    description: 'Restaurante',
    category: 'Alimentação',
    date: '08 nov · 20:05',
    amountCents: -7430n,
  },
  {
    id: '5',
    description: 'Internet fibra',
    category: 'Moradia',
    date: '07 nov · 10:30',
    amountCents: -10990n,
  },
  {
    id: '6',
    description: 'Transporte',
    category: 'Transporte',
    date: '06 nov · 18:12',
    amountCents: -5890n,
  },
  {
    id: '7',
    description: 'Farmácia',
    category: 'Saúde',
    date: '05 nov · 13:02',
    amountCents: -4330n,
  },
];

const categories = [
  { name: 'Alimentação', cents: 189880n, percent: 84 },
  { name: 'Moradia', cents: 25772n, percent: 11 },
  { name: 'Transporte', cents: 5890n, percent: 3 },
  { name: 'Saúde', cents: 4330n, percent: 2 },
];

const accounts = [
  { name: 'Conta principal', kind: 'Instituição demonstrativa', cents: 1245000n, share: 'Privada' },
  {
    name: 'Conta compartilhada',
    kind: 'Instituição demonstrativa',
    cents: 0n,
    share: 'Acesso completo',
  },
  { name: 'Reserva manual', kind: 'Carteira manual', cents: 237560n, share: 'Privada' },
];

const navigation: Array<{ id: Screen; label: string }> = [
  { id: 'home', label: 'Início' },
  { id: 'transactions', label: 'Movimentos' },
  { id: 'accounts', label: 'Contas' },
  { id: 'analysis', label: 'Análises' },
  { id: 'profile', label: 'Perfil' },
];

function makeStyles(palette: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: palette.canvas },
    app: { flex: 1, backgroundColor: palette.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
      backgroundColor: palette.surface,
    },
    brand: { color: palette.text, fontSize: 12, fontWeight: '700', letterSpacing: 0.7 },
    demoPill: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    scroll: { flex: 1 },
    content: { padding: spacing.md, paddingBottom: 24, gap: spacing.md },
    heading: { gap: 5, marginBottom: 2 },
    eyebrow: {
      color: palette.accent,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    title: { color: palette.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.6 },
    description: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    balanceCard: {
      padding: spacing.md,
      borderRadius: cornerRadius.large,
      backgroundColor: '#204c44',
      gap: 10,
    },
    balanceLabel: { color: '#dcebe5', fontSize: 12 },
    balanceValue: {
      color: '#ffffff',
      fontSize: 30,
      fontWeight: '700',
      letterSpacing: -0.7,
      fontVariant: ['tabular-nums'],
    },
    balanceCaption: { color: '#d2e2dc', fontSize: 10 },
    segment: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      padding: 3,
      borderRadius: 9,
      backgroundColor: 'rgba(0,0,0,0.15)',
      gap: 3,
    },
    segmentButton: {
      minHeight: 34,
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: 7,
    },
    segmentSelected: { backgroundColor: '#ffffff' },
    segmentText: { color: '#dcebe5', fontSize: 10, fontWeight: '600' },
    segmentTextSelected: { color: '#1e3832' },
    metricRow: { flexDirection: 'row', gap: spacing.sm },
    metricCard: {
      flex: 1,
      minHeight: 92,
      justifyContent: 'center',
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: cornerRadius.medium,
      backgroundColor: palette.surface,
      gap: 7,
    },
    metricLabel: { color: palette.muted, fontSize: 10 },
    metricValue: {
      color: palette.text,
      fontSize: 15,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    positive: { color: palette.positive },
    sectionTitle: { marginBottom: 9, color: palette.text, fontSize: 14, fontWeight: '700' },
    card: {
      padding: spacing.md,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: cornerRadius.medium,
      backgroundColor: palette.surface,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.border,
    },
    mark: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: palette.accentSoft,
    },
    markText: { color: palette.accent, fontSize: 12, fontWeight: '700' },
    transactionText: { flex: 1, gap: 3 },
    transactionName: { color: palette.text, fontSize: 11, fontWeight: '600' },
    transactionMeta: { color: palette.muted, fontSize: 9 },
    amount: { color: palette.text, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
    categoryLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 7,
    },
    categoryLabel: { color: palette.text, fontSize: 11 },
    categoryAmount: { color: palette.muted, fontSize: 10, fontVariant: ['tabular-nums'] },
    track: {
      height: 6,
      marginBottom: 14,
      overflow: 'hidden',
      borderRadius: 999,
      backgroundColor: palette.accentSoft,
    },
    fill: { height: '100%', borderRadius: 999, backgroundColor: palette.accent },
    actionButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: 10,
      backgroundColor: palette.accent,
    },
    actionText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
    filterRow: { flexDirection: 'row', gap: 7 },
    filterButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 999,
      backgroundColor: palette.surface,
    },
    filterSelected: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
    filterText: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    filterTextSelected: { color: palette.accent },
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.border,
    },
    accountMark: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
      backgroundColor: palette.accentSoft,
    },
    accountCopy: { flex: 1, gap: 4 },
    accountName: { color: palette.text, fontSize: 12, fontWeight: '700' },
    accountDetail: { color: palette.muted, fontSize: 9 },
    accountShare: { color: palette.accent, fontSize: 9, fontWeight: '700' },
    note: { color: palette.muted, fontSize: 10, lineHeight: 16 },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.border,
    },
    settingTitle: { color: palette.text, fontSize: 12, fontWeight: '600' },
    settingText: { flex: 1, color: palette.muted, fontSize: 10 },
    themeRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
    notice: {
      marginHorizontal: spacing.md,
      marginBottom: 6,
      padding: 10,
      borderRadius: 9,
      backgroundColor: palette.accentSoft,
    },
    noticeText: { color: palette.accent, fontSize: 10, textAlign: 'center' },
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: 3,
      paddingTop: 7,
      paddingBottom: 7,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.border,
      backgroundColor: palette.surface,
    },
    tab: {
      flex: 1,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderRadius: 8,
    },
    tabDot: { width: 6, height: 6, borderWidth: 1, borderColor: palette.muted, borderRadius: 999 },
    tabDotActive: { borderColor: palette.accent, backgroundColor: palette.accent },
    tabText: { color: palette.muted, fontSize: 9, fontWeight: '600' },
    tabTextActive: { color: palette.accent },
  });
}

function Amount({
  cents,
  hidden,
  styles,
}: {
  cents: bigint;
  hidden: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <Text style={styles.amount}>{hidden ? '••••••' : formatCents(cents)}</Text>;
}

function Heading({ title, styles }: { title: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>Dados fictícios</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>Protótipo local · nenhum banco conectado</Text>
    </View>
  );
}

function TransactionList({
  items,
  hidden,
  styles,
}: {
  items: DemoTransaction[];
  hidden: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <View style={styles.mark}>
            <Text style={styles.markText}>{item.category.slice(0, 1)}</Text>
          </View>
          <View style={styles.transactionText}>
            <Text style={styles.transactionName}>{item.description}</Text>
            <Text style={styles.transactionMeta}>
              {item.category} · {item.date}
            </Text>
          </View>
          <Text style={[styles.amount, item.amountCents > 0n ? styles.positive : undefined]}>
            {hidden ? '••••••' : formatCents(item.amountCents)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function FinanceApp() {
  const [screen, setScreen] = useState<Screen>('home');
  const [theme, setTheme] = useState<ThemeName>('light');
  const [hidden, setHidden] = useState(false);
  const [joint, setJoint] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [notice, setNotice] = useState('');
  const palette = themes[theme];
  const styles = makeStyles(palette);
  const filteredTransactions = transactions.filter((item) => {
    if (filter === 'income') return item.amountCents > 0n;
    if (filter === 'expense') return item.amountCents < 0n;
    return true;
  });
  const pageTitles: Record<Screen, string> = {
    home: 'Visão geral',
    transactions: 'Movimentações',
    accounts: 'Contas',
    analysis: 'Análises',
    profile: 'Perfil',
  };

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(''), 2600);
  }

  function renderScreen() {
    if (screen === 'home') {
      return (
        <>
          <Heading styles={styles} title="Visão geral" />
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Saldo consolidado · exemplo</Text>
            <Text style={styles.balanceValue}>
              {hidden ? '••••••' : formatCents(joint ? 2841230n : 1482560n)}
            </Text>
            <Text style={styles.balanceCaption}>
              {joint ? 'Visão conjunta demonstrativa' : 'Minhas contas demonstrativas'}
            </Text>
            <View style={styles.segment}>
              {([false, true] as const).map((value) => (
                <Pressable
                  key={String(value)}
                  onPress={() => setJoint(value)}
                  style={[
                    styles.segmentButton,
                    joint === value ? styles.segmentSelected : undefined,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      joint === value ? styles.segmentTextSelected : undefined,
                    ]}
                  >
                    {value ? 'Conjunta' : 'Minhas contas'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Entradas no mês</Text>
              <Text style={[styles.metricValue, styles.positive]}>
                {hidden ? '••••' : formatCents(825000n)}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Saídas no mês</Text>
              <Text style={styles.metricValue}>{hidden ? '••••' : formatCents(225872n)}</Text>
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Despesas por categoria</Text>
            {categories.map((item) => (
              <View key={item.name}>
                <View style={styles.categoryLine}>
                  <Text style={styles.categoryLabel}>{item.name}</Text>
                  <Text style={styles.categoryAmount}>
                    {hidden ? '••••' : formatCents(item.cents)}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${item.percent}%` }]} />
                </View>
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Movimentações recentes</Text>
            <TransactionList hidden={hidden} items={transactions.slice(0, 4)} styles={styles} />
          </View>
          <Pressable
            onPress={() => showNotice('Protótipo: este lançamento não foi salvo.')}
            style={styles.actionButton}
          >
            <Text style={styles.actionText}>Novo lançamento</Text>
          </Pressable>
        </>
      );
    }

    if (screen === 'transactions') {
      return (
        <>
          <Heading styles={styles} title="Movimentações" />
          <View style={styles.filterRow}>
            {(
              [
                ['all', 'Todas'],
                ['expense', 'Saídas'],
                ['income', 'Entradas'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setFilter(value)}
                style={[styles.filterButton, filter === value ? styles.filterSelected : undefined]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === value ? styles.filterTextSelected : undefined,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.card}>
            <TransactionList hidden={hidden} items={filteredTransactions} styles={styles} />
          </View>
          <Pressable
            onPress={() => showNotice('Protótipo: este lançamento não foi salvo.')}
            style={styles.actionButton}
          >
            <Text style={styles.actionText}>Novo lançamento</Text>
          </Pressable>
        </>
      );
    }

    if (screen === 'accounts') {
      return (
        <>
          <Heading styles={styles} title="Contas e carteiras" />
          <View style={styles.card}>
            {accounts.map((account) => (
              <View key={account.name} style={styles.accountRow}>
                <View style={styles.accountMark}>
                  <Text style={styles.markText}>{account.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.accountCopy}>
                  <Text style={styles.accountName}>{account.name}</Text>
                  <Text style={styles.accountDetail}>{account.kind} · exemplo</Text>
                  <Text style={styles.accountShare}>{account.share}</Text>
                </View>
                <Amount cents={account.cents} hidden={hidden} styles={styles} />
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            Contas privadas por padrão. Nenhuma conta real está conectada nem pode ser sincronizada
            neste protótipo.
          </Text>
          <Pressable
            onPress={() =>
              showNotice('Nenhuma conta foi conectada. A integração ainda não existe.')
            }
            style={styles.actionButton}
          >
            <Text style={styles.actionText}>Conectar uma conta</Text>
          </Pressable>
        </>
      );
    }

    if (screen === 'analysis') {
      return (
        <>
          <Heading styles={styles} title="Análises" />
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Saídas em novembro · fictícias</Text>
            <Text style={styles.balanceValue}>{hidden ? '••••••' : formatCents(225872n)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Por categoria</Text>
            {categories.map((item) => (
              <View key={item.name}>
                <View style={styles.categoryLine}>
                  <Text style={styles.categoryLabel}>{item.name}</Text>
                  <Text style={styles.categoryAmount}>
                    {hidden ? '••••' : formatCents(item.cents)}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${item.percent}%` }]} />
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            Os valores e proporções são ilustrativos, sem vínculo com uma conta ou instituição.
          </Text>
        </>
      );
    }

    return (
      <>
        <Heading styles={styles} title="Perfil e ajustes" />
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Perfil demonstrativo</Text>
              <Text style={styles.note}>Davi · sessão local</Text>
            </View>
          </View>
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Ocultar valores</Text>
              <Text style={styles.note}>Esconde saldos desta sessão.</Text>
            </View>
            <Switch
              value={hidden}
              onValueChange={setHidden}
              trackColor={{ true: palette.accent }}
            />
          </View>
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Aparência</Text>
              <View style={styles.themeRow}>
                {(['light', 'dark'] as const).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setTheme(value)}
                    style={[
                      styles.filterButton,
                      theme === value ? styles.filterSelected : undefined,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        theme === value ? styles.filterTextSelected : undefined,
                      ]}
                    >
                      {value === 'light' ? 'Claro' : 'Escuro'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
        <Text style={styles.note}>
          Preferências ainda não são salvas. A autenticação será implementada depois.
        </Text>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.app}>
        <View style={styles.header}>
          <Text style={styles.brand}>MEU FINANCEIRO</Text>
          <Text style={styles.demoPill}>DADOS FICTÍCIOS</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>{pageTitles[screen]}</Text>
          {renderScreen()}
        </ScrollView>
        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
        <View style={styles.tabBar}>
          {navigation.map((item) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: screen === item.id }}
              key={item.id}
              onPress={() => setScreen(item.id)}
              style={styles.tab}
            >
              <View style={[styles.tabDot, screen === item.id ? styles.tabDotActive : undefined]} />
              <Text style={[styles.tabText, screen === item.id ? styles.tabTextActive : undefined]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
