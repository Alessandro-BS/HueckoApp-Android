import type { Incidence } from '@hueckoapp/shared';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { Badge, HueckoCard, LoadState, PrimaryButton, SecondaryButton, VoteWindowRow } from '../../components';
import { useProposal } from '../../hooks/useProposal';
import { useRefreshErrorToast } from '../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import type { AppStackScreen } from '../../navigation/types';
import { colors, radius, typography } from '../../theme';
import { today } from '../../utils/clock';
import { CRITICALITY_BADGE, INCIDENCE_LABEL, isUpcoming, isVotingOpen } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { ConfirmPlanDialog } from './ConfirmPlanDialog';
import { ReplanSheet } from './ReplanSheet';
import { confirmCancelPlan } from './confirmCancelPlan';
import { ExpressVoteCard } from './ExpressVoteCard';
import { ProposalHeader } from './ProposalHeader';
import { ReportIncidenceSheet } from './ReportIncidenceSheet';
import { VotingSummaryCard } from './VotingSummaryCard';

function IncidenceRow({ incidence }: { incidence: Incidence }) {
  const badge = CRITICALITY_BADGE[incidence.criticality];
  const delay = incidence.delayMinutes !== null ? ` (${incidence.delayMinutes} min)` : '';
  return (
    <HueckoCard padding={14}>
      <View style={styles.incidenceHeader}>
        <Text style={[typography.titleSmall, styles.flex, { color: colors.onSurface }]}>
          {`${incidence.user.name} · ${INCIDENCE_LABEL[incidence.type]}${delay}`}
        </Text>
        {incidence.resolved ? (
          <Badge text="Resuelto" containerColor={colors.successContainer} contentColor={colors.onSuccessContainer} />
        ) : (
          <Badge text={badge.text} containerColor={badge.container} contentColor={badge.content} />
        )}
      </View>
      <Text style={[typography.bodySmall, styles.reason]}>{incidence.reason}</Text>
    </HueckoCard>
  );
}

export function PlanDetailScreen({ navigation, route }: AppStackScreen<'PlanDetail'>) {
  const { proposalId } = route.params;
  const { proposal, loading, refreshing, error, failedLoads, reload, confirm, cancel, reportIncidence, voteExpress, replan } = useProposal(proposalId);
  useRefreshOnFocus(reload);
  useRefreshErrorToast(error, proposal !== undefined, failedLoads);
  const [sheet, setSheet] = useState<'confirm' | 'incidence' | 'replan' | null>(null);

  if (!proposal) {
    return (
      <View style={styles.centered}>
        <LoadState loading={loading} error={error ?? 'Plan no encontrado'} hasData={false} onRetry={() => void reload()}>
          {null}
        </LoadState>
      </View>
    );
  }

  const now = today();
  // Quién gestiona lo decide el servidor (canManage: el creador mientras siga en el grupo, o cualquier organizador); la app no compara ids.
  const canManage = proposal.canManage;
  const active = proposal.state === 'CONFIRMADO' || proposal.state === 'EN_RECOORDINACION';
  // La votación exprés y «Reportar imprevisto» solo tienen sentido si el plan aún no ocurrió (D3).
  const activeUpcoming = active && isUpcoming(proposal, now);
  // Tarjeta de la votación exprés (abierta o la última cerrada) o, en recoordinación, «Proponer franjas». La
  // recoordinación siempre está vigente: la regla anterior conservaba la fecha vieja y, aunque ya pasara, el plan
  // sigue atascado hasta que quien gestiona lo replantee.
  const showExpress = proposal.state === 'EN_RECOORDINACION' || (activeUpcoming && proposal.expressVote !== null);
  // Solo se reporta sobre un plan confirmado: en recoordinación no hay fecha a la que faltar (409 INVALID_STATE).
  const canReport = activeUpcoming && proposal.state === 'CONFIRMADO';
  const openVoteId = proposal.expressVote?.status === 'ABIERTA' ? proposal.expressVote.id : null;

  const doCancel = async () => {
    try {
      await cancel();
      showToast('Plan cancelado.');
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  const confirmCancel = () => confirmCancelPlan(proposal.title, () => void doCancel());

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
      >
        <ProposalHeader proposal={proposal} now={now} details />

        {showExpress ? (
          <ExpressVoteCard proposal={proposal} now={now} onVote={voteExpress} onReplan={replan} onStale={() => void reload()} />
        ) : null}

        {proposal.state !== 'CANCELADO' ? <VotingSummaryCard proposalId={proposal.id} /> : null}

        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Franjas horarias</Text>
        {proposal.windows.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Aún no hay franjas propuestas para este plan.</Text>
        ) : (
          <View style={styles.list}>
            {proposal.windows.map((w) => (
              <VoteWindowRow key={w.id} window={w} voted={proposal.myVoteWindowId === w.id} chosen={proposal.chosenWindowId === w.id} />
            ))}
          </View>
        )}

        {isVotingOpen(proposal, now) ? (
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Voting', { proposalId })} style={styles.goVote}>
            <Text style={[typography.titleSmall, { color: colors.onPrimary }]}>Ir a votar</Text>
          </Pressable>
        ) : null}

        {active || proposal.incidences.length > 0 ? (
          <View style={styles.list}>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Imprevistos</Text>
            {proposal.incidences.length === 0 ? (
              <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Nadie ha reportado imprevistos.</Text>
            ) : (
              proposal.incidences.map((i) => <IncidenceRow key={i.id} incidence={i} />)
            )}
            {canReport ? <SecondaryButton title="Reportar imprevisto" icon="report-problem" onPress={() => setSheet('incidence')} /> : null}
          </View>
        ) : null}

        {canManage && proposal.state !== 'CANCELADO' ? (
          <View style={styles.list}>
            {proposal.state === 'PROPUESTO' ? (
              <PrimaryButton title="Confirmar plan" icon="event-available" onPress={() => setSheet('confirm')} />
            ) : null}
            <SecondaryButton title="Cancelar plan" icon="event-busy" color={colors.error} onPress={confirmCancel} />
          </View>
        ) : null}
      </ScrollView>

      {sheet === 'confirm' ? (
        <ConfirmPlanDialog
          windows={proposal.windows}
          onConfirm={confirm}
          onDone={() => {
            setSheet(null);
            showToast('Plan confirmado.');
          }}
          onReplan={() => setSheet('replan')}
          onDismiss={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'replan' ? (
        <ReplanSheet
          title="Replantear propuesta"
          submitLabel="Replantear votación"
          onSubmit={async (input) => {
            await replan(input);
            setSheet(null);
            showToast('Propuesta replanteada: se borraron los votos.');
          }}
          onDismiss={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'incidence' ? (
        <ReportIncidenceSheet
          openVoteId={openVoteId}
          onReport={reportIncidence}
          // El aviso («Se abrió una votación del grupo» o «Avisamos al grupo») lo da la hoja según la respuesta.
          onDone={() => setSheet(null)}
          onDismiss={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  list: { gap: 8 },
  goVote: { borderRadius: radius.xxl, backgroundColor: colors.primary, padding: 16 },
  incidenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { color: colors.onSurfaceVariant, marginTop: 4 },
});
