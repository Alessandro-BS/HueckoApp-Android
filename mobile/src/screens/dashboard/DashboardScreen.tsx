import { MaterialIcons } from '@expo/vector-icons';
import type { Group, ProposalWithGroup, UpcomingPlan } from '@hueckoapp/shared';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createGroup } from '../../api/groups';
import { resolveIncidences } from '../../api/proposals';
import {
  Avatar, Badge, EmptyState, ErrorBanner, HueckoCard, LoadState, PrimaryButton, SecondaryButton, SectionHeader, VoteWindowRow, type IconName,
} from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../hooks/useDashboard';
import { useRefreshErrorToast } from '../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import type { DrawerScreen } from '../../navigation/types';
import { categoryColor, colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { attendanceLabel, BLOCK_BADGE, greetingLine, groupMatchLabel, groupSlotLabel, longDate, weekBlocksLabel } from '../../utils/dashboard';
import { blocksForDay, dayShort, isoDayOf } from '../../utils/days';
import { deadlineLabel, isVotingOpen, scheduleLabel } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { CreateGroupDialog } from '../groups/GroupDialogs';
import { ExpressVoteCard } from '../proposals/ExpressVoteCard';

type MetricProps = { icon: IconName; value: string; label: string; caption: string; onPress: () => void };

function MetricCard({ icon, value, label, caption, onPress }: MetricProps) {
  return (
    <HueckoCard onPress={onPress} padding={16} style={styles.flex}>
      <MaterialIcons name={icon} size={20} color={colors.primary} />
      <Text style={[typography.displaySmall, styles.metricValue]}>{value}</Text>
      <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{label}</Text>
      <Text style={[typography.bodySmall, styles.caption]}>{caption}</Text>
    </HueckoCard>
  );
}

function UpcomingPlanCard({ plan, meId, onPress }: { plan: UpcomingPlan; meId: string | undefined; onPress: () => void }) {
  return (
    <HueckoCard containerColor={colors.primaryContainer} borderColor={colors.primaryContainer} onPress={onPress}>
      <Text style={[typography.labelMedium, styles.onContainer]}>{scheduleLabel(plan) ?? ''}</Text>
      <Text style={[typography.headlineSmall, styles.onContainer, styles.planTitle]}>{plan.title}</Text>
      <View style={[styles.iconLine, styles.planPlace]}>
        <MaterialIcons name="place" size={16} color={colors.onPrimaryContainer} />
        <Text style={[typography.bodyMedium, styles.onContainer]}>{plan.location?.name ?? 'Lugar por definir'}</Text>
      </View>
      <View style={[styles.iconLine, styles.planAttendance]}>
        <MaterialIcons name="groups" size={16} color={colors.onPrimaryContainer} />
        <Text style={[typography.bodyMedium, styles.onContainer]}>{attendanceLabel(plan.attendees)}</Text>
      </View>
      <View style={styles.avatars}>
        {plan.attendees.slice(0, 6).map((a, i) => (
          <Avatar key={a.user.id} name={a.user.id === meId ? 'Tú' : a.user.name} color={categoryColor(i)} />
        ))}
      </View>
    </HueckoCard>
  );
}

function PendingVoteCard({ proposal, now, disabled, onVote }: {
  proposal: ProposalWithGroup;
  now: Date;
  disabled: boolean;
  onVote: (windowId: string) => void;
}) {
  const open = isVotingOpen(proposal, now);
  return (
    <HueckoCard>
      <Text style={[typography.labelMedium, { color: colors.primary }]}>{proposal.groupName || 'Grupo'}</Text>
      <Text style={[typography.titleLarge, styles.pendingTitle]}>{proposal.title}</Text>
      <Text style={[typography.bodySmall, styles.caption]}>{deadlineLabel(proposal.votingDeadline, now)}</Text>
      <View style={styles.pendingWindows}>
        {proposal.windows.map((w) => (
          <VoteWindowRow
            key={w.id}
            window={w}
            voted={proposal.myVoteWindowId === w.id}
            countStyle="plain"
            onPress={open ? () => onVote(w.id) : undefined}
            disabled={disabled}
          />
        ))}
      </View>
    </HueckoCard>
  );
}

export function DashboardScreen({ navigation }: DrawerScreen<'Dashboard'>) {
  const { user } = useAuth();
  const { dashboard, loaded, loading, refreshing, error, reload, blocks, toggleVote, voting, voteError } = useDashboard();
  const [now, setNow] = useState(today);
  // Al volver a Inicio se recarga todo y se actualiza «hoy» (saludo, horario del día y plazos).
  const refresh = useCallback(async () => {
    setNow(today());
    await reload();
  }, [reload]);
  useRefreshOnFocus(refresh);
  useRefreshErrorToast(error, loaded);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const goGroups = () => navigation.navigate('Groups');
  const goSchedule = () => navigation.navigate('Schedule');

  // F7: la alternancia vive en useDashboard (useVoteToggle); no lanza, y el aviso sale del valor devuelto.
  const vote = async (proposalId: string, windowId: string) => {
    const result = await toggleVote(proposalId, windowId);
    if (result.ok) showToast(result.value === 'voted' ? 'Tu voto ha sido registrado.' : 'Tu voto se ha retirado.');
  };

  const onGroupCreated = (group: Group) => {
    setCreatingGroup(false);
    showToast(`Grupo «${group.name}» creado.`);
    void reload();
  };

  const isoToday = isoDayOf(now);
  const todayBlocks = blocksForDay(blocks, isoToday, now);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} colors={[colors.primary]} />}
      >
        <View>
          <Text style={[typography.bodySmall, styles.caption]}>{longDate(now)}</Text>
          <Text style={[typography.headlineLarge, styles.greeting]}>{greetingLine(now, user?.name)}</Text>
          <Text style={[typography.bodyMedium, styles.subtitle]}>Esto es lo que pasa hoy en tus grupos y horarios.</Text>
        </View>

        <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
          {dashboard ? (
            <>
              {dashboard.expressAlert ? (
                <ExpressVoteCard
                  kind={dashboard.expressAlert.kind}
                  who={dashboard.expressAlert.who}
                  reason={dashboard.expressAlert.reason}
                  planTitle={dashboard.expressAlert.planTitle}
                  canResolve={dashboard.expressAlert.canResolve}
                  creatorName={dashboard.expressAlert.createdBy.name}
                  onResolve={(input) => resolveIncidences(dashboard.expressAlert!.proposalId, input)}
                  onResolved={() => void reload()}
                />
              ) : null}

              <View style={styles.grid}>
                <View style={styles.gridRow}>
                  <MetricCard icon="groups" value={String(dashboard.metrics.activeGroups)} label="Grupos activos" caption="Con disponibilidad sincronizada" onPress={goGroups} />
                  <MetricCard icon="how-to-vote" value={String(dashboard.metrics.openVotes)} label="Votaciones abiertas" caption="Planes pendientes de hora" onPress={goGroups} />
                </View>
                <View style={styles.gridRow}>
                  <MetricCard icon="schedule" value={`${dashboard.metrics.matchingHours} h`} label="Horas coincidentes" caption="Donde coincide el 80% o más" onPress={goSchedule} />
                  <MetricCard icon="calendar-month" value={String(dashboard.metrics.totalBlocks)} label="Mi horario" caption="Bloques registrados" onPress={goSchedule} />
                </View>
              </View>

              <View style={styles.section}>
                <SectionHeader title="Próximo plan confirmado" />
                {dashboard.nextPlan ? (
                  <UpcomingPlanCard
                    plan={dashboard.nextPlan}
                    meId={user?.id}
                    onPress={() => navigation.navigate('PlanDetail', { proposalId: dashboard.nextPlan!.id })}
                  />
                ) : (
                  <EmptyState
                    title="Sin planes confirmados"
                    description="Propón un plan en tus grupos y Huecko sugerirá los mejores horarios."
                    icon="event-busy"
                    actionLabel="Ir a mis grupos"
                    onAction={goGroups}
                  />
                )}
              </View>

              <HueckoCard>
                <SectionHeader title="Mi horario de hoy" actionLabel="Ver todo" onAction={goSchedule} />
                <View style={styles.cardGap} />
                {todayBlocks.length === 0 ? (
                  <View style={styles.freeDay}>
                    <MaterialIcons name="event-available" size={22} color={colors.primary} />
                    <View style={styles.flex}>
                      <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{`Nada en la agenda para hoy (${dayShort(isoToday)})`}</Text>
                      <Text style={[typography.bodySmall, styles.caption]}>{weekBlocksLabel(dashboard.metrics.totalBlocks)}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.todayList}>
                    {todayBlocks.map((b, i) => {
                      const badge = BLOCK_BADGE[b.type];
                      return (
                        <View key={b.id} style={styles.blockRow}>
                          <View style={[styles.dot, { backgroundColor: categoryColor(i) }]} />
                          <View style={styles.flex}>
                            <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{b.label}</Text>
                            <Text style={[typography.bodySmall, styles.caption]}>{`${b.startTime} - ${b.endTime}`}</Text>
                          </View>
                          <Badge text={badge.text} containerColor={badge.container} contentColor={badge.content} />
                        </View>
                      );
                    })}
                  </View>
                )}
              </HueckoCard>

              <HueckoCard>
                <SectionHeader title="Mis grupos" actionLabel="Gestionar" onAction={goGroups} />
                <View style={styles.cardGap} />
                {dashboard.groups.length === 0 ? (
                  <Text style={[typography.bodyMedium, styles.caption]}>Todavía no perteneces a ningún grupo.</Text>
                ) : (
                  <View style={styles.groupList}>
                    {dashboard.groups.map((g, i) => (
                      <Pressable
                        key={g.id}
                        accessibilityRole="button"
                        onPress={() => navigation.navigate('GroupDetail', { groupId: g.id, name: g.name })}
                        style={styles.groupRow}
                      >
                        <Avatar name={g.name} color={categoryColor(i)} size={40} />
                        <View style={styles.flex}>
                          <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{g.name}</Text>
                          <Text style={[typography.bodySmall, styles.caption]}>{groupSlotLabel(g)}</Text>
                        </View>
                        <Badge text={groupMatchLabel(g)} containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </HueckoCard>

              <SectionHeader title="Votaciones en curso" subtitle="Opciones generadas a partir de la disponibilidad del grupo." />
              {voteError ? <ErrorBanner message={voteError} /> : null}
              {dashboard.pendingVotes.length === 0 ? (
                <EmptyState
                  title="No hay votaciones activas"
                  description="Cuando alguien proponga un plan podrás elegir aquí tu franja preferida."
                  icon="how-to-vote"
                  actionLabel="Ver grupos"
                  onAction={goGroups}
                />
              ) : (
                dashboard.pendingVotes.map((p) => (
                  <PendingVoteCard key={p.id} proposal={p} now={now} disabled={voting} onVote={(windowId) => void vote(p.id, windowId)} />
                ))
              )}

              <View style={styles.quickActions}>
                <SecondaryButton title="Nuevo grupo" icon="group-add" style={styles.flex} onPress={() => setCreatingGroup(true)} />
                <PrimaryButton title="Editar horario" icon="edit-calendar" style={styles.flex} onPress={goSchedule} />
              </View>
            </>
          ) : null}
        </LoadState>
      </ScrollView>
      {creatingGroup ? (
        <CreateGroupDialog
          submit={(name) => createGroup({ name: name.trim() })}
          onDone={onGroupCreated}
          onDismiss={() => setCreatingGroup(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 24 },
  caption: { color: colors.onSurfaceVariant },
  greeting: { color: colors.onSurface, marginTop: 4 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 6 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  metricValue: { color: colors.onSurface, marginTop: 12 },
  section: { gap: 12 },
  onContainer: { color: colors.onPrimaryContainer },
  planTitle: { marginTop: 6 },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planPlace: { marginTop: 12 },
  planAttendance: { marginTop: 4 },
  avatars: { flexDirection: 'row', gap: 6, marginTop: 16 },
  cardGap: { height: 14 },
  freeDay: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  todayList: { gap: 10 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  groupList: { gap: 14 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pendingTitle: { color: colors.onSurface, marginTop: 4, marginBottom: 2 },
  pendingWindows: { gap: 8, marginTop: 16 },
  quickActions: { flexDirection: 'row', gap: 10 },
});
