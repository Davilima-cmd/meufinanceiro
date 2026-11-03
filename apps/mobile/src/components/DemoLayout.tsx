import type { ReactNode } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

export function DemoLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.demoBadge}>
          <View style={styles.demoDot} />
          <Text style={styles.demoText}>DEMONSTRAÇÃO · DADOS FICTÍCIOS</Text>
        </View>
        <Text style={styles.eyebrow}>MEU FINANCEIRO</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {children}
        <Text style={styles.footer}>Sem conexão com instituições financeiras.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export function DemoCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7f5',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  demoBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e8e3d8',
    borderRadius: 20,
    backgroundColor: '#fbf8f2',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  demoDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#c8984f',
  },
  demoText: {
    color: '#806b47',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  eyebrow: {
    marginBottom: 6,
    color: '#748078',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#192720',
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 19,
    color: '#748078',
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e8ede8',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 16,
  },
  footer: {
    marginTop: 23,
    color: '#99a49b',
    fontSize: 10,
    textAlign: 'center',
  },
});
