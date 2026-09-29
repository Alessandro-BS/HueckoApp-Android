import { MaterialIcons } from '@expo/vector-icons';
import type { PlanSuggestion } from '@hueckoapp/shared';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AiDemoHint, Badge, BottomSheet, ErrorBanner, HueckoCard, PrimaryButton, SecondaryButton } from '../../components';
import { useAiSuggestions } from '../../hooks/useAiSuggestions';
import { colors, typography } from '../../theme';
import { CATEGORY_ICON, CATEGORY_LABEL, prefillFromSuggestion, type ProposalPrefill } from '../../utils/ai';
import { windowLabel } from '../../utils/proposals';

type Props = { groupId: string; onUse: (prefill: ProposalPrefill) => void; onDismiss: () => void };

function SuggestionCard({ suggestion, onUse }: { suggestion: PlanSuggestion; onUse: () => void }) {
  return (
    <HueckoCard padding={16} style={styles.card}>
      <View style={styles.titleRow}>
        <MaterialIcons name={CATEGORY_ICON[suggestion.category]} size={22} color={colors.primary} />
        <Text style={[typography.titleMedium, styles.flex, { color: colors.onSurface }]}>{suggestion.title}</Text>
        <Badge text={CATEGORY_LABEL[suggestion.category]} containerColor={colors.secondaryContainer} contentColor={colors.onSecondaryContainer} />
      </View>
      {suggestion.placeIdea ? (
        <View style={styles.line}>
          <MaterialIcons name="place" size={16} color={colors.onSurfaceVariant} />
          <Text style={[typography.bodySmall, styles.muted]}>{suggestion.placeIdea}</Text>
        </View>
      ) : null}
      <View style={styles.line}>
        <MaterialIcons name="schedule" size={16} color={colors.onSurfaceVariant} />
        <Text style={[typography.bodySmall, styles.muted]}>
          {suggestion.window ? windowLabel(suggestion.window) : 'Sin hueco en común: elige la franja al crear.'}
        </Text>
      </View>
      <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{suggestion.reason}</Text>
      <PrimaryButton title="Usar" icon="edit-note" onPress={onUse} />
    </HueckoCard>
  );
}

// «Ideas con IA» (pestaña Planes): 3 ideas para los huecos reales del grupo. Se piden al abrir la hoja.
export function SuggestionsSheet({ groupId, onUse, onDismiss }: Props) {
  const { suggestions, loading, error, fetch } = useAiSuggestions(groupId);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return (
    <BottomSheet title="Ideas con Huecko IA" subtitle="Planes pensados para los huecos libres reales del grupo." onDismiss={onDismiss}>
      <AiDemoHint />
      {loading ? (
        <View style={styles.line}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[typography.bodyMedium, styles.muted]}>Buscando ideas para el grupo…</Text>
        </View>
      ) : null}
      {error && !loading ? (
        <>
          <ErrorBanner message={error} />
          <SecondaryButton title="Reintentar" icon="refresh" onPress={() => void fetch()} />
        </>
      ) : null}
      {suggestions?.map((s, i) => (
        <SuggestionCard key={`${i}-${s.title}`} suggestion={s} onUse={() => onUse(prefillFromSuggestion(s))} />
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { color: colors.onSurfaceVariant },
});
