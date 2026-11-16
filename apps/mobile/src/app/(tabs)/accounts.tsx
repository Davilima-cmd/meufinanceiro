import { Text, View } from 'react-native';
import { DemoCard, DemoLayout } from '../../components/DemoLayout';
import { demoAccounts, formatBRL } from '../../data/demo-data';
import { styles } from './screen-styles';

export default function Accounts() {
  return (
    <DemoLayout
      title="Contas e carteiras"
      subtitle="Contas de exemplo e níveis de compartilhamento."
    >
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Privacidade primeiro</Text>
        <Text style={styles.rowMeta}>
          As contas são privadas por padrão. O compartilhamento abaixo é apenas demonstrativo.
        </Text>
      </View>
      {demoAccounts.map((account) => (
        <DemoCard key={account.name}>
          <View style={styles.accountHeader}>
            <View style={styles.accountSymbol}>
              <Text style={styles.accountSymbolText}>M</Text>
            </View>
            <Text style={[styles.shareBadge, account.sharing !== 'Privada' && styles.sharedBadge]}>
              {account.sharing}
            </Text>
          </View>
          <Text style={styles.accountOwner}>{account.owner}</Text>
          <Text style={styles.panelTitle}>{account.name}</Text>
          <Text style={styles.rowMeta}>{account.institution}</Text>
          <Text style={styles.accountBalance}>{formatBRL(account.balanceCents)}</Text>
          <Text style={styles.accountKind}>{account.kind}</Text>
          {account.sharing === 'BALANCE_ONLY' && (
            <Text style={styles.permissionNote}>
              Saldo visível na visão conjunta. Transações não são compartilhadas.
            </Text>
          )}
        </DemoCard>
      ))}
    </DemoLayout>
  );
}
