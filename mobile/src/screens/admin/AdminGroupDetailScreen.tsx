import type { AdminProposalSummary } from '@hueckoapp/shared';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, ErrorBanner, HueckoCard, LoadState, ProposalStateBadge, SecondaryButton, SectionHeader } from '../../components';
import { useAdminGroup } from '../../hooks/useAdminGroup';
import type { AppStackScreen } from '../../navigation/types';
import { categoryColorFor, colors, typography } from '../../theme';
import { countLabel } from '../../utils/admin';
import { memberCountLabel } from '../../utils/groups';
import { voteCountLabel } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { CancelProposalDialog } from './CancelProposalDialog';

export function AdminGroupDetailScreen({ navigation, route }: AppStackScreen<'AdminGroupDetail'>) {
  const { groupId } = route.params;
  const { group, loading, error, reload, remove, removing, removeError, cancelProposal, cancelling, cancelError, clearCancelError } =
    useAdminGroup(groupId);
  const [target, setTarget] = useState<AdminProposalSummary | null>(null);

  const name = group?.name;
  useEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [name, navigation]);

  if (!group) {
    return (
      <View style={styles.centered}>
        <LoadState loading={loading} error={error ?? 'Grupo no encontrado.'} hasData={false} onRetry={() => void reload()}>
          {null}
        </LoadState>
      </View>
    );
  }

  const handleDelete = async () => {
    if (!(await remove()).ok) return;
    showToast(`Grupo «${group.name}» eliminado.`);
    navigation.goBack();
  };
  const confirmDelete = () =>
    Alert.alert(
      'Eliminar grupo',
      `Se borrará «${group.name}» con ${memberCountLabel(group.memberCount)} y ${countLabel(group.proposalCount, 'propuesta', 'propuestas')}. No se puede deshacer.`,
      [
        { text: 'Volver', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void handleDelete() },
      ],
    );

  const closeDialog = () => {
    clearCancelError();
    setTarget(null);
  };
  const confirmCancel = async (reason: string) => {
    if (!target) return;
    const result = await cancelProposal(target.id, reason);
    if (!result.ok) return; // el error se queda en el diálogo
    setTarget(null);
    showToast('Propuesta cancelada.');
  };

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{group.name}</Text>
          {group.description ? <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{group.description}</Text> : null}
          <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>
            {`Código ${group.inviteCode} · ${memberCountLabel(group.memberCount)} · umbral ${group.availabilityThreshold} %`}
          </Text>
          <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
            {group.owner ? `Administra: ${group.owner.name}` : 'Sin administrador'}
          </Text>
        </View>

        <SectionHeader title="Miembros" />
        {group.members.map((m) => (
          <View key={m.id} style={styles.row}>
            <Avatar name={m.name} color={categoryColorFor(m.name)} size={32} />
            <View style={styles.flex}>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{m.name}</Text>
              <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{m.email}</Text>
            </View>
            <Text style={[typography.labelSmall, { color: colors.onSurfaceVariant }]}>
              {m.role === 'OWNER' ? 'Administra' : m.isEssential ? 'Imprescindible' : 'Miembro'}
            </Text>
          </View>
        ))}

        <SectionHeader title="Propuestas" />
        {group.proposals.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Este grupo no tiene propuestas.</Text>
        ) : (
          group.proposals.map((p) => (
            <HueckoCard key={p.id}>
              <View style={styles.cardBody}>
                <View style={styles.row}>
                  <Text style={[typography.titleMedium, styles.flex, { color: colors.onSurface }]}>{p.title}</Text>
                  <ProposalStateBadge state={p.state} />
                </View>
                <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
                  {`${p.createdBy.name} · ${voteCountLabel(p.voteCount)} · ${countLabel(p.incidenceCount, 'incidencia', 'incidencias')}`}
                </Text>
                {p.state !== 'CANCELADO' ? (
                  <SecondaryButton
                    title="Cancelar propuesta"
                    icon="block"
                    color={colors.error}
                    accessibilityLabel={`Cancelar «${p.title}»`}
                    onPress={() => setTarget(p)}
                  />
                ) : null}
              </View>
            </HueckoCard>
          ))
        )}

        {removeError ? <ErrorBanner message={removeError} /> : null}
        <SecondaryButton title="Eliminar grupo" icon="delete-outline" color={colors.error} disabled={removing} onPress={confirmDelete} />
      </ScrollView>
      {target ? (
        <CancelProposalDialog
          proposal={target}
          loading={cancelling}
          error={cancelError}
          onConfirm={(reason) => void confirmCancel(reason)}
          onDismiss={closeDialog}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  header: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  cardBody: { gap: 8 },
});
