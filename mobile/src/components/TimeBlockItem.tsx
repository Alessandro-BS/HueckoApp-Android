import { MaterialIcons } from '@expo/vector-icons';
import type { TimeBlock } from '@hueckoapp/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryColorFor, colors, radius, typography } from '../theme';
import { dayShort, formatDateLabel } from '../utils/days';
import { Badge } from './Badge';

type Props = { block: TimeBlock; onDelete?: () => void };

// TimeBlockItem (UI spec §2.9). Un puntual muestra su fecha («Vie 2 oct») en vez de «Puntual».
export function TimeBlockItem({ block, onDelete }: Props) {
  const when =
    block.isRecurring && block.dayOfWeek ? dayShort(block.dayOfWeek) : block.date ? formatDateLabel(block.date) : 'Puntual';
  const isPunctual = !block.isRecurring || block.type === 'PUNTUAL';

  return (
    <View style={styles.item}>
      <View style={[styles.accent, { backgroundColor: categoryColorFor(block.id) }]} />
      <View style={styles.texts}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{block.label}</Text>
        <Text style={[typography.bodySmall, styles.subtitle]}>{`${when} · ${block.startTime} - ${block.endTime}`}</Text>
      </View>
      {isPunctual ? <Badge text="Puntual" containerColor={colors.secondaryContainer} contentColor={colors.onSecondaryContainer} /> : null}
      {block.type === 'LIBRE' ? <Badge text="Libre" containerColor={colors.successContainer} contentColor={colors.onSuccessContainer} /> : null}
      {onDelete ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Eliminar ${block.label}`} onPress={onDelete} style={styles.delete}>
          <MaterialIcons name="delete-outline" size={22} color={colors.error} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  accent: { width: 4, height: 40, borderRadius: radius.sm },
  texts: { flex: 1 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 2 },
  delete: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
