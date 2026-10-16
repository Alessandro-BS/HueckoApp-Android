import { MaterialIcons } from '@expo/vector-icons';
import type { TimeWindow } from '@hueckoapp/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../theme';
import { availabilityLabel, voteCountLabel, windowLabel } from '../utils/proposals';
import { Badge } from './Badge';

type Props = {
  window: TimeWindow;
  voted: boolean;
  /** Sin onPress la fila es de solo lectura (Detalle del plan). */
  onPress?: () => void;
  disabled?: boolean;
  /** Recuento en cápsula (Votar, Detalle) o como texto (Inicio), UI spec §2.3 y §2.7. */
  countStyle?: 'pill' | 'plain';
  /** Franja elegida al confirmar. */
  chosen?: boolean;
};

// Fila de franja unificada (UI spec §3.10): check si es mi voto, franja, % del grupo y recuento.
export function VoteWindowRow({ window, voted, onPress, disabled = false, countStyle = 'pill', chosen = false }: Props) {
  const count = voteCountLabel(window.voteCount);
  const hasVotes = window.voteCount > 0;
  const content = (
    <View style={styles.row}>
      <View style={styles.check}>
        {voted ? <MaterialIcons name="check" size={20} color={colors.primary} accessibilityLabel="Tu voto" /> : null}
      </View>
      <View style={styles.texts}>
        <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{windowLabel(window)}</Text>
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{availabilityLabel(window.availabilityPercentage)}</Text>
      </View>
      {chosen ? <Badge text="Elegida" containerColor={colors.primary} contentColor={colors.onPrimary} /> : null}
      {countStyle === 'pill' ? (
        <View style={[styles.pill, { backgroundColor: hasVotes ? colors.primaryContainer : colors.surfaceContainerLow }]}>
          <Text style={[typography.labelMedium, { color: hasVotes ? colors.onPrimaryContainer : colors.onSurfaceVariant }]}>{count}</Text>
        </View>
      ) : (
        <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{count}</Text>
      )}
    </View>
  );
  const frame = [styles.frame, voted ? styles.voted : styles.notVoted];
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: voted, disabled }} disabled={disabled} onPress={onPress} style={frame}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.xxl, paddingHorizontal: 14, paddingVertical: 12 },
  voted: { backgroundColor: colors.primaryContainer, borderWidth: 2, borderColor: colors.primary },
  notVoted: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 20, height: 20 },
  texts: { flex: 1 },
  pill: { borderRadius: radius.xxl, paddingHorizontal: 10, paddingVertical: 4 },
});
