import type { TopGroup } from '@hueckoapp/shared';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DateRange } from '../../../api/admin';
import {
  ChartCard, ChoiceChip, DateTimeField, ErrorBanner, HueckoCard, LoadState, PrimaryButton, SecondaryButton, StatTile,
} from '../../../components';
import { useAction } from '../../../hooks/useAction';
import { useAdminReport } from '../../../hooks/useAdminReport';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { colors, typography } from '../../../theme';
import { customRange, percentLabel, periodLabel, presetRange, RANGE_PRESETS, type RangePreset } from '../../../utils/admin';
import { today } from '../../../utils/clock';
import { shareReportCsv, shareReportPdf } from '../../../utils/shareReport';
import { AiUsageCard } from '../AiUsageCard';
import { hourPoints, seriesPoints, statePoints } from '../chartData';

function TopGroupsCard({ groups }: { groups: readonly TopGroup[] }) {
  return (
    <HueckoCard>
      <View style={styles.cardBody}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Grupos con más propuestas</Text>
        {groups.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Ningún grupo creó propuestas en este periodo.</Text>
        ) : (
          groups.map((g) => (
            <View key={g.id} style={styles.row}>
              <Text style={[typography.bodyMedium, styles.flex, { color: colors.onSurface }]}>{g.name}</Text>
              <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{g.proposals}</Text>
            </View>
          ))
        )}
      </View>
    </HueckoCard>
  );
}

// «Informes»: el periodo se elige aquí; las cifras, el PDF y el CSV salen del mismo AdminReport del servidor.
// El periodo aplicado son días de calendario «YYYY-MM-DD», ambos incluidos (DateRange): el servidor los interpreta en su zona.
export function ReportsTab() {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [custom, setCustom] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [applied, setApplied] = useState<DateRange>(() => presetRange('30d', today()));
  const [rangeError, setRangeError] = useState<string | null>(null);
  const { report, loaded, loading, refreshing, error, failedLoads, reload } = useAdminReport(applied);
  useRefreshErrorToast(error, loaded, failedLoads);
  const pdf = useAction(shareReportPdf);
  const csv = useAction(shareReportCsv);

  const choose = (next: RangePreset) => {
    setPreset(next);
    setRangeError(null);
    if (next !== 'custom') setApplied(presetRange(next, today())); // «Personalizado» espera a «Aplicar»
  };

  const applyCustom = () => {
    const result = customRange(custom.from, custom.to);
    if (!result.ok) {
      setRangeError(result.error);
      return;
    }
    setRangeError(null);
    setApplied(result.range);
  };

  const byBucket = (day: string, week: string) => (report?.bucket === 'week' ? week : day);
  const exportError = pdf.error ?? csv.error;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <View style={styles.chips}>
        {RANGE_PRESETS.map((p) => (
          <ChoiceChip key={p.key} label={p.label} selected={preset === p.key} onPress={() => choose(p.key)} />
        ))}
      </View>
      {preset === 'custom' ? (
        <View style={styles.custom}>
          <DateTimeField label="Desde" mode="date" value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} />
          <DateTimeField
            label="Hasta"
            mode="date"
            value={custom.to}
            onChange={(to) => setCustom((c) => ({ ...c, to }))}
            error={rangeError ?? undefined}
          />
          <PrimaryButton title="Aplicar" icon="check" onPress={applyCustom} />
        </View>
      ) : null}
      <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
        {report ? (
          <>
            <Text accessibilityRole="header" style={[typography.titleLarge, { color: colors.onSurface }]}>
              {periodLabel(report.period.fromDate, report.period.toDate)}
            </Text>
            <View style={styles.tiles}>
              <StatTile label="Usuarios nuevos" value={report.summary.newUsers} />
              <StatTile label="Grupos nuevos" value={report.summary.newGroups} />
              <StatTile label="Propuestas nuevas" value={report.summary.newProposals} />
              <StatTile label="Planes confirmados" value={report.summary.confirmedPlans} />
              <StatTile label="Incidencias" value={report.summary.incidences} />
              <StatTile label="Llamadas a la IA" value={report.summary.aiCalls} hint={`Éxito: ${percentLabel(report.ai.successRate)}`} />
            </View>
            <ChartCard
              testID="report-registrations"
              kind="line"
              title={byBucket('Registros por día', 'Registros por semana')}
              data={seriesPoints(report.timeseries, (p) => p.registrations)}
            />
            <ChartCard
              testID="report-proposals"
              title={byBucket('Propuestas creadas por día', 'Propuestas creadas por semana')}
              color={colors.tertiary}
              data={seriesPoints(report.timeseries, (p) => p.proposalsCreated)}
            />
            <ChartCard testID="report-states" title="Propuestas del periodo por estado" data={statePoints(report.proposalsByState)} />
            <ChartCard
              testID="report-hours"
              title="Hora de inicio de los planes confirmados"
              color={colors.secondary}
              emptyText="Ningún plan confirmado en este periodo."
              data={hourPoints(report.popularHours)}
            />
            <AiUsageCard usage={report.ai} />
            <TopGroupsCard groups={report.topGroups} />
            {exportError ? <ErrorBanner message={exportError} /> : null}
            <View style={styles.actions}>
              <SecondaryButton title="Exportar CSV" icon="grid-on" style={styles.flex} disabled={csv.loading} onPress={() => void csv.run(report)} />
              <PrimaryButton title="Exportar PDF" icon="picture-as-pdf" style={styles.flex} loading={pdf.loading} onPress={() => void pdf.run(report)} />
            </View>
          </>
        ) : null}
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  custom: { gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardBody: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
