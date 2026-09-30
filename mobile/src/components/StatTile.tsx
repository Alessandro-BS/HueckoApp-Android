import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';

type Props = { label: string; value: string | number; hint?: string };

// Cifra grande con su etiqueta (panel de administración). Dos por fila en la rejilla; se lee como «Usuarios: 4».
export function StatTile({ label, value, hint }: Props) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{value}</Text>
      <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
      {hint ? <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flexBasis: '47%', flexGrow: 1, gap: 2, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceContainerLow },
});
