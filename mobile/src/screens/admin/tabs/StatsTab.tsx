import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChartCard, LoadState, StatTile } from '../../../components';
import { STATS_WEEKS, useAdminStats } from '../../../hooks/useAdminStats';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { colors } from '../../../theme';
import { percentLabel } from '../../../utils/admin';
import { AiUsageCard } from '../AiUsageCard';
import { hourPoints, seriesPoints, statePoints } from '../chartData';

// «Estadísticas»: totales de ahora, las últimas 12 semanas y las horas de los planes. Todo viene calculado del servidor.
export function StatsTab() {
  const { stats, weekly, hours, loaded, loading, refreshing, error, failedLoads, reload } = useAdminStats();
  useRefreshErrorToast(error, loaded, failedLoads);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
        {stats && weekly && hours ? (
          <>
            <View style={styles.tiles}>
              <StatTile label="Usuarios" value={stats.users.total} />
              <StatTile label="Cuentas activas" value={stats.users.active} />
              <StatTile label="Suspendidas" value={stats.users.suspended} />
              <StatTile label="Administradores" value={stats.users.admins} />
              <StatTile label="Grupos" value={stats.groups} />
              <StatTile label="Planes confirmados" value={stats.confirmedPlans} />
              <StatTile label="Incidencias" value={stats.incidences} />
              <StatTile label="Llamadas a la IA" value={stats.ai.calls} hint={`Éxito: ${percentLabel(stats.ai.successRate)}`} />
            </View>
            <ChartCard testID="chart-states" title="Propuestas por estado" data={statePoints(stats.proposals)} />
            <ChartCard
              testID="chart-registrations"
              kind="line"
              title={`Registros por semana (últimas ${STATS_WEEKS})`}
              data={seriesPoints(weekly.points, (p) => p.registrations)}
            />
            <ChartCard
              testID="chart-proposals"
              title="Propuestas creadas por semana"
              color={colors.tertiary}
              data={seriesPoints(weekly.points, (p) => p.proposalsCreated)}
            />
            <ChartCard
              testID="chart-hours"
              title="Hora de inicio de los planes confirmados"
              color={colors.secondary}
              emptyText="Todavía no hay planes confirmados."
              data={hourPoints(hours.hours)}
            />
            <AiUsageCard usage={stats.ai} />
          </>
        ) : null}
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
