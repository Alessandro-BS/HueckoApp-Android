import type { Proposal } from '@hueckoapp/shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HueckoCard, LoadState, ProposalStateBadge, SecondaryButton } from '../../../components';
import { useProposals } from '../../../hooks/useProposals';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import type { AppStackParamList } from '../../../navigation/types';
import { colors, typography } from '../../../theme';
import type { ProposalPrefill } from '../../../utils/ai';
import { today } from '../../../utils/clock';
import { deadlineLabel, isVotingOpen, scheduleLabel } from '../../../utils/proposals';
import { SuggestionsSheet } from '../SuggestionsSheet';

type Props = { groupId: string; groupName: string };

function TextButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.textButton}>
      <Text style={[typography.labelLarge, { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

type CardProps = { proposal: Proposal; now: Date; onDetails: () => void; onVote?: () => void };

// PlanCard (UI spec §2.6): título, lugar, plazo (o fecha si está confirmado) y estado.
function PlanCard({ proposal, now, onDetails, onVote }: CardProps) {
  const when = scheduleLabel(proposal) ?? deadlineLabel(proposal.votingDeadline, now);
  return (
    <HueckoCard>
      <View style={styles.cardRow}>
        <View style={styles.flex}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{proposal.title}</Text>
          {proposal.location ? <Text style={[typography.bodySmall, styles.location]}>{proposal.location.name}</Text> : null}
          <Text style={[typography.bodySmall, styles.when]}>{when}</Text>
        </View>
        <ProposalStateBadge state={proposal.state} />
      </View>
      <View style={styles.cardActions}>
        <TextButton title="Ver detalles" onPress={onDetails} />
        {onVote ? <TextButton title="Votar" onPress={onVote} /> : null}
      </View>
    </HueckoCard>
  );
}

// «Planes» del grupo: las propuestas que no están canceladas (D7, igual que proposalsOf en Kotlin).
export function PlansTab({ groupId, groupName }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { proposals, loaded, loading, refreshing, error, failedLoads, reload } = useProposals(groupId);
  // Al volver de «Nueva propuesta», «Votar» o «Detalle del plan» se recarga la lista.
  useRefreshOnFocus(reload);
  useRefreshErrorToast(error, loaded, failedLoads);
  const now = today();
  const visible = proposals.filter((p) => p.state !== 'CANCELADO');
  const [ideasOpen, setIdeasOpen] = useState(false);
  const applyIdea = (prefill: ProposalPrefill) => {
    setIdeasOpen(false);
    navigation.navigate('CreateProposal', { groupId, groupName, prefill });
  };

  return (
    <>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <View style={styles.topActions}>
        <SecondaryButton
          title="Crear propuesta"
          icon="add"
          style={styles.flex}
          onPress={() => navigation.navigate('CreateProposal', { groupId, groupName })}
        />
        <SecondaryButton title="Ideas con IA" icon="auto-awesome" style={styles.flex} onPress={() => setIdeasOpen(true)} />
      </View>
      <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Planes propuestos</Text>
      <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
        {visible.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Nadie ha propuesto un plan todavía.</Text>
        ) : (
          visible.map((proposal) => (
            <PlanCard
              key={proposal.id}
              proposal={proposal}
              now={now}
              onDetails={() => navigation.navigate('PlanDetail', { proposalId: proposal.id })}
              onVote={isVotingOpen(proposal, now) ? () => navigation.navigate('Voting', { proposalId: proposal.id }) : undefined}
            />
          ))
        )}
      </LoadState>
    </ScrollView>
    {ideasOpen ? <SuggestionsSheet groupId={groupId} onUse={applyIdea} onDismiss={() => setIdeasOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  location: { color: colors.onSurfaceVariant, marginTop: 2 },
  when: { color: colors.onSurfaceVariant, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  topActions: { flexDirection: 'row', gap: 10 },
  textButton: { minHeight: 40, justifyContent: 'center', paddingRight: 12 },
});
