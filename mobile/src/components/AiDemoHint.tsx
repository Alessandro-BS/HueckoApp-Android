import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useAiStatus } from '../hooks/useAiStatus';
import { colors, typography } from '../theme';
import { AI_DEMO_TEXT } from '../utils/ai';

// Aviso de modo demostración (D2, D12). Solo se monta en superficies de IA que el usuario ya abrió.
export function AiDemoHint() {
  const { demo } = useAiStatus();
  if (!demo) return null;
  return (
    <View style={styles.row} accessibilityRole="text">
      <MaterialIcons name="info-outline" size={18} color={colors.onSurfaceVariant} />
      <Text style={[typography.bodySmall, styles.text]}>{AI_DEMO_TEXT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceContainer },
  text: { flex: 1, color: colors.onSurfaceVariant },
});
