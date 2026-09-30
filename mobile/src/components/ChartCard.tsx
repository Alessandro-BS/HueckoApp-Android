import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';

import { colors, typography } from '../theme';
import { HueckoCard } from './HueckoCard';

export type ChartPoint = { label: string; value: number };

type Props = {
  title: string;
  data: readonly ChartPoint[];
  kind?: 'bar' | 'line';
  color?: string;
  emptyText?: string;
  testID?: string;
};

const CHART_HEIGHT = 160;
// Márgenes de la pantalla (16 + 16), relleno de la tarjeta (16 + 16) y el eje Y (~36).
const HORIZONTAL_CHROME = 100;

/**
 * Único punto de contacto con react-native-gifted-charts (D11): las pantallas pasan puntos { label, value }
 * ya calculados por el servidor. El lector de pantalla recibe los mismos datos como texto.
 */
export function ChartCard({ title, data, kind = 'bar', color = colors.primary, emptyText = 'Sin datos en este periodo.', testID }: Props) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(160, width - HORIZONTAL_CHROME);
  const empty = data.every((p) => p.value === 0);
  const slot = chartWidth / Math.max(1, data.length);
  const barWidth = Math.max(4, Math.min(28, slot * 0.6));
  const spacing = Math.max(2, slot - barWidth);
  const axisText = { ...typography.labelSmall, color: colors.onSurfaceVariant };
  const points = data.map((p) => ({ value: p.value, label: p.label, frontColor: color }));
  const summary = `${title}. ${data.map((p, i) => `${p.label || i + 1}: ${p.value}`).join(', ')}`;

  return (
    <HueckoCard>
      <View testID={testID} accessible accessibilityLabel={summary} style={styles.body}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{title}</Text>
        {empty ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{emptyText}</Text>
        ) : kind === 'bar' ? (
          <BarChart
            data={points}
            width={chartWidth}
            height={CHART_HEIGHT}
            barWidth={barWidth}
            spacing={spacing}
            initialSpacing={spacing / 2}
            noOfSections={4}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={colors.outlineVariant}
            yAxisTextStyle={axisText}
            xAxisLabelTextStyle={axisText}
            disableScroll
            isAnimated
          />
        ) : (
          <LineChart
            data={points}
            width={chartWidth}
            height={CHART_HEIGHT}
            color={color}
            dataPointsColor={color}
            thickness={2}
            noOfSections={4}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={colors.outlineVariant}
            yAxisTextStyle={axisText}
            xAxisLabelTextStyle={axisText}
            adjustToWidth
            disableScroll
            isAnimated
          />
        )}
      </View>
    </HueckoCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
});
