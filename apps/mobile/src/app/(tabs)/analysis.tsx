import { Text, View } from 'react-native';
import { DemoCard, DemoLayout } from '../../components/DemoLayout';
import { demoCategories, formatBRL } from '../../data/demo-data';
import { styles } from './screen-styles';

export default function Analysis() {
  return (
    <DemoLayout title="Análises" subtitle="Padrões de gastos ilustrativos de outubro.">
      <DemoCard>
        <Text style={styles.panelTitle}>Despesas por categoria</Text>
        <Text style={styles.rowMeta}>Outubro · valores fictícios</Text>
        {demoCategories.map((category) => (
          <View key={category.name} style={styles.analysisCategory}>
            <View style={styles.categoryHeader}>
              <Text style={styles.rowTitle}>{category.name}</Text>
              <Text style={styles.rowAmount}>{formatBRL(category.amountCents)}</Text>
            </View>
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel={`${category.name}: ${category.percent}% do limite demonstrativo`}
              accessibilityValue={{ min: 0, max: 100, now: category.percent }}
            >
              <View style={[styles.progressValue, { width: `${category.percent}%` }]} />
            </View>
            <Text style={styles.rowMeta}>{category.percent}% do limite demonstrativo</Text>
          </View>
        ))}
      </DemoCard>
      <View style={styles.notice}>
        <Text style={styles.rowMeta}>
          Orçamentos e metas serão conectados a dados reais em uma fase posterior. Nada nesta tela
          representa dados bancários.
        </Text>
      </View>
    </DemoLayout>
  );
}
