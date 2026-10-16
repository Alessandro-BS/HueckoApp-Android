import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorBanner, HueckoCard, LoadState, SectionHeader, VoteWindowRow } from '../../components';
import { useProposal } from '../../hooks/useProposal';
import { useRefreshErrorToast } from '../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import type { AppStackScreen } from '../../navigation/types';
import { colors, radius, typography } from '../../theme';
import { today } from '../../utils/clock';
import { isVotingOpen } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { AddWindowSheet } from './AddWindowSheet';
import { ProposalHeader } from './ProposalHeader';

export function VotingScreen({ route }: AppStackScreen<'Voting'>) {
  const { proposalId } = route.params;
  const { proposal, loading, refreshing, error, failedLoads, reload, toggleVote, voting, voteError, addWindow } = useProposal(proposalId);
  useRefreshOnFocus(reload);
  useRefreshErrorToast(error, proposal !== undefined, failedLoads);
  const [adding, setAdding] = useState(false);

  if (!proposal) {
    return (
      <View style={styles.centered}>
        <LoadState loading={loading} error={error ?? 'Propuesta no encontrada'} hasData={false} onRetry={() => void reload()}>
          {null}
        </LoadState>
      </View>
    );
  }

  const now = today();
  const open = isVotingOpen(proposal, now);

  // Un voto por persona: tocar otra franja lo mueve; tocar la mía lo retira (G1).
  const vote = async (windowId: string) => {
    const result = await toggleVote(windowId);
    if (result.ok) showToast(result.value === 'voted' ? 'Tu voto ha sido registrado.' : 'Tu voto se ha retirado.');
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
      >
        <ProposalHeader proposal={proposal} now={now} />
        <SectionHeader title="Elige una franja horaria" subtitle="Selecciona la opción que más te convenga. Un voto por persona." />
        {!open ? (
          <HueckoCard containerColor={colors.surfaceContainer} borderColor={colors.surfaceContainer} padding={16}>
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>La votación está cerrada.</Text>
          </HueckoCard>
        ) : null}
        {voteError ? <ErrorBanner message={voteError} /> : null}
        {proposal.windows.length === 0 ? (
          <HueckoCard>
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>No hay franjas disponibles. Agrega una manualmente.</Text>
          </HueckoCard>
        ) : (
          <View style={styles.windows}>
            {proposal.windows.map((w) => (
              <VoteWindowRow
                key={w.id}
                window={w}
                voted={proposal.myVoteWindowId === w.id}
                chosen={proposal.chosenWindowId === w.id}
                onPress={open ? () => void vote(w.id) : undefined}
                disabled={voting}
              />
            ))}
          </View>
        )}
        {open ? (
          <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={styles.addButton}>
            <MaterialIcons name="add" size={20} color={colors.primary} />
            <Text style={[typography.titleSmall, { color: colors.primary }]}>Agregar franja horaria</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {adding ? (
        <AddWindowSheet
          existing={proposal.windows}
          onAdd={addWindow}
          onDone={() => {
            setAdding(false);
            showToast('Franja horaria agregada.');
          }}
          onDismiss={() => setAdding(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  windows: { gap: 8 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
});
