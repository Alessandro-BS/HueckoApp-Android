import { StyleSheet, Text, View } from 'react-native';

import { SecondaryButton } from '../../components';
import { colors, typography } from '../../theme';

type Props = { page: number; pageCount: number; hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void };

// «Anterior · Página 2 de 3 · Siguiente». Con una sola página no se pinta.
export function Pager({ page, pageCount, hasPrev, hasNext, onPrev, onNext }: Props) {
  if (pageCount <= 1) return null;
  return (
    <View style={styles.row}>
      <SecondaryButton title="Anterior" icon="chevron-left" disabled={!hasPrev} onPress={onPrev} style={styles.flex} />
      <Text style={[typography.labelLarge, { color: colors.onSurfaceVariant }]}>{`Página ${page} de ${pageCount}`}</Text>
      <SecondaryButton title="Siguiente" icon="chevron-right" disabled={!hasNext} onPress={onNext} style={styles.flex} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  flex: { flex: 1 },
});
