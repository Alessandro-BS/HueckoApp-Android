import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, EmptyState, HueckoCard, LoadState } from '../../../components';
import { useAvailability } from '../../../hooks/useAvailability';
import { colors, typography } from '../../../theme';
import { dayLong } from '../../../utils/days';
import { groupWindowsByDay } from '../../../utils/groups';

type Props = { groupId: string; threshold: number; memberCount: number };

// «Huecos»: franjas en común calculadas por el servidor (GET /groups/:id/availability).
export function AvailabilityTab({ groupId, threshold, memberCount }: Props) {
  const { windows, loaded, loading, refreshing, error, reload } = useAvailability(groupId);
  const days = groupWindowsByDay(windows);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        {`Franjas de 08:00 a 20:00 en las que está libre al menos el ${threshold}% del grupo, según los horarios recurrentes de cada miembro.`}
      </Text>
      <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
        {days.length === 0 ? (
          <EmptyState
            title="Sin huecos en común"
            description={`Ninguna franja alcanza el ${threshold}% de disponibilidad que pide el grupo.`}
            icon="event-busy"
          />
        ) : (
          days.map((day) => (
            <View key={day.dayOfWeek} style={styles.day}>
              <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{dayLong(day.dayOfWeek)}</Text>
              {day.windows.map((w) => (
                <HueckoCard key={`${w.dayOfWeek}-${w.startTime}`} padding={14}>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{`${w.startTime} - ${w.endTime}`}</Text>
                      <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
                        {`${w.freeMembers} de ${memberCount} libres`}
                      </Text>
                    </View>
                    <Badge text={`${w.availabilityPercentage}%`} containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
                  </View>
                </HueckoCard>
              ))}
            </View>
          ))
        )}
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 20 },
  day: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
