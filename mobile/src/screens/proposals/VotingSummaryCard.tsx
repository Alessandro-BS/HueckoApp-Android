import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AiDemoHint, Badge, ErrorBanner, HueckoCard, SecondaryButton } from '../../components';
import { useVotingSummary } from '../../hooks/useVotingSummary';
import { colors, typography } from '../../theme';
import { RECOMMENDATION_BADGE } from '../../utils/ai';

// «Resumen con Huecko IA» (D9): se pide a demanda y nunca cambia el plan.
export function VotingSummaryCard({ proposalId }: { proposalId: string }) {
  const { summary, loading, error, request } = useVotingSummary(proposalId);
  const badge = summary ? RECOMMENDATION_BADGE[summary.recommendation] : null;

  return (
    <HueckoCard padding={16} style={styles.card}>
      <View style={styles.header}>
        <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
        <Text style={[typography.titleMedium, styles.flex, { color: colors.onSurface }]}>Resumen con Huecko IA</Text>
        {badge ? <Badge text={`Sugerencia: ${badge.text}`} containerColor={badge.container} contentColor={badge.content} /> : null}
      </View>
      {summary ? (
        <>
          <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{summary.summary}</Text>
          <Text style={[typography.bodySmall, styles.muted]}>{summary.reason}</Text>
          <AiDemoHint />
          <Text style={[typography.bodySmall, styles.muted]}>Solo es una sugerencia: Huecko IA no cambia nada del plan.</Text>
        </>
      ) : (
        <Text style={[typography.bodySmall, styles.muted]}>
          Resume los votos y los imprevistos y te sugiere si confirmar, reprogramar o cancelar. No cambia nada del plan.
        </Text>
      )}
      {error ? <ErrorBanner message={error} /> : null}
      <SecondaryButton
        title={loading ? 'Resumiendo…' : summary ? 'Actualizar resumen' : 'Resumir votación'}
        icon="auto-awesome"
        disabled={loading}
        onPress={() => void request()}
      />
    </HueckoCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { color: colors.onSurfaceVariant },
});
