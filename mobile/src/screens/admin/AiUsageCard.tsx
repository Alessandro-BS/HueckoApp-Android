import type { AiUsage } from '@hueckoapp/shared';
import { StyleSheet, Text, View } from 'react-native';

import { HueckoCard } from '../../components';
import { colors, typography } from '../../theme';
import { AI_TASK_LABEL, percentLabel } from '../../utils/admin';

/** «2,1 s» (coma decimal). */
export const durationLabel = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

// Llamadas, % de éxito y duración media por función de la IA (Estadísticas e Informes).
export function AiUsageCard({ usage }: { usage: AiUsage }) {
  return (
    <HueckoCard>
      <View style={styles.body}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Uso de la IA por función</Text>
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
          {`${usage.calls} llamadas · éxito ${percentLabel(usage.successRate)}`}
        </Text>
        {usage.byTask.map((t) => (
          <View key={t.task} style={styles.row}>
            <Text style={[typography.bodyMedium, styles.flex, { color: colors.onSurface }]}>{AI_TASK_LABEL[t.task]}</Text>
            <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>
              {`${t.calls} · ${percentLabel(t.successRate)}${t.avgDurationMs === null ? '' : ` · ${durationLabel(t.avgDurationMs)}`}`}
            </Text>
          </View>
        ))}
      </View>
    </HueckoCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
