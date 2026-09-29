import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from './src/theme/colors';

// Pantalla provisional de la Fase 0. En la Fase 1 se reemplaza por la navegación
// (stack de autenticación + drawer principal + tabs del grupo).
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>HueckoApp</Text>
      <Text style={styles.subtitle}>Coordinación de horarios entre amigos</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.primary,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
});
