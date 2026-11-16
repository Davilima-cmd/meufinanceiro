import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { DemoCard, DemoLayout } from '../../components/DemoLayout';
import { styles } from './screen-styles';

export default function Profile() {
  const [valuesHidden, setValuesHidden] = useState(false);

  return (
    <DemoLayout title="Perfil e preferências" subtitle="Preferências locais deste protótipo.">
      <DemoCard>
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.rowTitle}>Ocultar valores</Text>
            <Text style={styles.rowMeta}>Esconda os valores financeiros exibidos no início.</Text>
          </View>
          <Switch
            value={valuesHidden}
            onValueChange={setValuesHidden}
            accessibilityLabel="Ocultar valores"
            trackColor={{ false: '#c8d0ca', true: '#205a43' }}
            thumbColor="#ffffff"
          />
        </View>
        <View style={styles.profileNote}>
          <Text style={styles.rowTitle}>Conta de demonstração</Text>
          <Text style={styles.rowMeta}>
            Login, sessões e preferências ainda não estão conectados a uma API.
          </Text>
        </View>
      </DemoCard>
    </DemoLayout>
  );
}
