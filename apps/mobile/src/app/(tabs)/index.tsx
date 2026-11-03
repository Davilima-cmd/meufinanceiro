import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DemoCard, DemoLayout } from '../../components/DemoLayout';
import { demoAccounts, demoTransactions, formatBRL } from '../../data/demo-data';

export default function Index() {
  const [valuesHidden, setValuesHidden] = useState(false);
  const [jointView, setJointView] = useState(false);
  const personalBalance = demoAccounts
    .filter((account) => account.owner === 'Minha conta')
    .reduce((total, account) => total + account.balanceCents, 0n);
  const jointBalance = personalBalance + demoAccounts[2]!.balanceCents;
  const displayedBalance = jointView ? jointBalance : personalBalance;
  const showMoney = (cents: bigint) => (valuesHidden ? '••••••' : formatBRL(cents));

  return (
    <DemoLayout
      title="Suas finanças, com clareza."
      subtitle="Um resumo fictício para explorar o Meu Financeiro."
    >
      <View
        style={localStyles.viewSwitch}
        accessibilityRole="radiogroup"
        accessibilityLabel="Visão das contas"
      >
        <Pressable
          style={[localStyles.viewButton, !jointView && localStyles.viewButtonSelected]}
          onPress={() => setJointView(false)}
          accessibilityRole="radio"
          accessibilityState={{ selected: !jointView }}
        >
          <Text
            style={[localStyles.viewButtonText, !jointView && localStyles.viewButtonTextSelected]}
          >
            Minhas contas
          </Text>
        </Pressable>
        <Pressable
          style={[localStyles.viewButton, jointView && localStyles.viewButtonSelected]}
          onPress={() => setJointView(true)}
          accessibilityRole="radio"
          accessibilityState={{ selected: jointView }}
        >
          <Text
            style={[localStyles.viewButtonText, jointView && localStyles.viewButtonTextSelected]}
          >
            Visão conjunta
          </Text>
        </Pressable>
      </View>

      <View style={localStyles.balanceCard}>
        <View style={localStyles.balanceHeader}>
          <Text style={localStyles.balanceLabel}>SALDO CONSOLIDADO · DEMONSTRAÇÃO</Text>
          <Switch
            value={valuesHidden}
            onValueChange={setValuesHidden}
            accessibilityLabel={valuesHidden ? 'Mostrar valores' : 'Ocultar valores'}
            trackColor={{ false: '#73917c', true: '#c4d9cb' }}
            thumbColor="#ffffff"
          />
        </View>
        <Text style={localStyles.balanceAmount}>{showMoney(displayedBalance)}</Text>
        <Text style={localStyles.balanceFootnote}>
          {jointView
            ? '3 contas demonstrativas, incluindo saldo compartilhado'
            : '2 contas demonstrativas'}
        </Text>
      </View>

      <View style={localStyles.summaryRow}>
        <DemoCard>
          <Text style={localStyles.summaryLabel}>Receitas · outubro</Text>
          <Text style={localStyles.summaryAmount}>{showMoney(642000n)}</Text>
        </DemoCard>
        <DemoCard>
          <Text style={localStyles.summaryLabel}>Despesas · outubro</Text>
          <Text style={localStyles.summaryAmount}>{showMoney(387000n)}</Text>
        </DemoCard>
      </View>

      <DemoCard>
        <View style={localStyles.panelHeading}>
          <Text style={localStyles.panelTitle}>Movimentações recentes</Text>
          <Text style={localStyles.panelMeta}>Fictícias</Text>
        </View>
        {demoTransactions.slice(0, 3).map((transaction) => (
          <View key={transaction.title} style={localStyles.transactionRow}>
            <View style={localStyles.transactionMark}>
              <Text style={localStyles.transactionMarkText}>
                {transaction.amountCents > 0n ? '+' : '−'}
              </Text>
            </View>
            <View style={localStyles.transactionDescription}>
              <Text style={localStyles.transactionTitle}>{transaction.title}</Text>
              <Text style={localStyles.transactionMeta}>
                {transaction.category} · {transaction.date}
              </Text>
            </View>
            <Text
              style={[
                localStyles.transactionValue,
                transaction.amountCents > 0n && localStyles.incomeText,
              ]}
            >
              {showMoney(transaction.amountCents)}
            </Text>
          </View>
        ))}
      </DemoCard>

      <View style={localStyles.privacyNote}>
        <Text style={localStyles.privacyTitle}>Tudo começa privado</Text>
        <Text style={localStyles.privacyText}>
          O compartilhamento de contas é explícito e pode ser revogado.
        </Text>
      </View>
    </DemoLayout>
  );
}

const localStyles = StyleSheet.create({
  viewSwitch: {
    flexDirection: 'row' as const,
    alignSelf: 'flex-start' as const,
    gap: 3,
    marginBottom: 3,
    borderWidth: 1,
    borderColor: '#e8ede8',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 3,
  },
  viewButton: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  viewButtonSelected: {
    backgroundColor: '#eaf3ed',
  },
  viewButtonText: {
    color: '#748078',
    fontSize: 10,
  },
  viewButtonTextSelected: {
    color: '#205a43',
    fontWeight: '700' as const,
  },
  balanceCard: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#1c4d39',
    padding: 17,
  },
  balanceHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  balanceLabel: {
    flex: 1,
    color: '#c4d9cb',
    fontSize: 9,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
  },
  balanceAmount: {
    marginTop: 10,
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'] as const,
  },
  balanceFootnote: {
    marginTop: 8,
    color: '#c4d9cb',
    fontSize: 10,
  },
  summaryRow: {
    flexDirection: 'row' as const,
    gap: 9,
  },
  summaryLabel: {
    color: '#748078',
    fontSize: 10,
  },
  summaryAmount: {
    marginTop: 8,
    color: '#192720',
    fontSize: 17,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'] as const,
  },
  panelHeading: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  panelTitle: {
    color: '#192720',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  panelMeta: {
    color: '#748078',
    fontSize: 9,
  },
  transactionRow: {
    minHeight: 55,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: '#e8ede8',
  },
  transactionMark: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 8,
    backgroundColor: '#f8efeb',
  },
  transactionMarkText: {
    color: '#b6755c',
    fontWeight: '700' as const,
  },
  transactionDescription: {
    flex: 1,
  },
  transactionTitle: {
    color: '#192720',
    fontSize: 10,
    fontWeight: '600' as const,
  },
  transactionMeta: {
    marginTop: 4,
    color: '#748078',
    fontSize: 9,
  },
  transactionValue: {
    color: '#192720',
    fontSize: 9,
    fontVariant: ['tabular-nums'] as const,
  },
  incomeText: {
    color: '#205a43',
  },
  privacyNote: {
    marginTop: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#d5ac67',
    backgroundColor: '#fbf8f2',
    padding: 12,
  },
  privacyTitle: {
    color: '#192720',
    fontSize: 10,
    fontWeight: '700' as const,
  },
  privacyText: {
    marginTop: 4,
    color: '#748078',
    fontSize: 9,
    lineHeight: 15,
  },
});
