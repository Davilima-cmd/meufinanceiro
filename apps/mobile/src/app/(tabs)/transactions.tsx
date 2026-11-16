import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { DemoCard, DemoLayout } from '../../components/DemoLayout';
import { demoTransactions, formatBRL } from '../../data/demo-data';
import { styles } from './screen-styles';

export default function Transactions() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todas');
  const categories = [
    'Todas',
    ...new Set(demoTransactions.map((transaction) => transaction.category)),
  ];
  const filtered = useMemo(
    () =>
      demoTransactions.filter((transaction) => {
        const matchesQuery = `${transaction.title} ${transaction.category}`
          .toLocaleLowerCase('pt-BR')
          .includes(query.toLocaleLowerCase('pt-BR'));
        return matchesQuery && (filter === 'Todas' || transaction.category === filter);
      }),
    [filter, query]
  );

  return (
    <DemoLayout title="Movimentações" subtitle="Lançamentos fictícios para explorar a organização.">
      <DemoCard>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar lançamento"
          placeholderTextColor="#748078"
          style={styles.searchInput}
          accessibilityLabel="Buscar movimentações"
        />
        <View style={styles.filterList}>
          {categories.map((category) => (
            <Text
              key={category}
              onPress={() => setFilter(category)}
              style={[styles.filterChip, filter === category && styles.filterChipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === category }}
            >
              {category}
            </Text>
          ))}
        </View>
        <Text style={styles.resultLabel}>{filtered.length} lançamentos · demonstração</Text>
        {filtered.length > 0 ? (
          filtered.map((transaction) => (
            <View key={transaction.title} style={styles.listRow}>
              <View
                style={[styles.transactionMark, transaction.amountCents > 0n && styles.incomeMark]}
              >
                <Text
                  style={[
                    styles.transactionMarkText,
                    transaction.amountCents > 0n && styles.incomeText,
                  ]}
                >
                  {transaction.amountCents > 0n ? '+' : '−'}
                </Text>
              </View>
              <View style={styles.description}>
                <Text style={styles.rowTitle}>{transaction.title}</Text>
                <Text style={styles.rowMeta}>
                  {transaction.category} · {transaction.date}
                </Text>
              </View>
              <Text style={[styles.rowAmount, transaction.amountCents > 0n && styles.incomeText]}>
                {formatBRL(transaction.amountCents)}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.rowTitle}>Nenhum lançamento encontrado</Text>
            <Text style={styles.rowMeta}>Ajuste sua busca ou escolha outra categoria.</Text>
          </View>
        )}
      </DemoCard>
    </DemoLayout>
  );
}
