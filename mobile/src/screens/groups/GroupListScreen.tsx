import type { Group, GroupSummary } from '@hueckoapp/shared';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, HueckoCard, LoadState, PrimaryButton, SecondaryButton } from '../../components';
import { useGroups } from '../../hooks/useGroups';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import type { DrawerScreen } from '../../navigation/types';
import { categoryColorFor, colors, typography } from '../../theme';
import { memberCountLabel } from '../../utils/groups';
import { showToast } from '../../utils/toast';
import { CreateGroupDialog, JoinGroupDialog } from './GroupDialogs';

type OpenDialog = 'create' | 'join' | null;

function GroupCard({ group, onPress }: { group: GroupSummary; onPress: () => void }) {
  return (
    <HueckoCard onPress={onPress} padding={0}>
      <View style={[styles.banner, { backgroundColor: categoryColorFor(group.name) }]}>
        <Text style={[typography.displaySmall, styles.initial]}>{group.name.trim().charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{group.name}</Text>
        {group.description ? (
          <Text numberOfLines={2} style={[typography.bodySmall, styles.description]}>
            {group.description}
          </Text>
        ) : null}
        <Text style={[typography.labelSmall, styles.count]}>{memberCountLabel(group.memberCount)}</Text>
      </View>
    </HueckoCard>
  );
}

export function GroupListScreen({ navigation }: DrawerScreen<'Groups'>) {
  const { groups, loading, refreshing, error, reload, create, join } = useGroups();
  useRefreshOnFocus(reload);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const close = () => setDialog(null);

  const onCreated = (group: Group) => {
    close();
    showToast(`Grupo «${group.name}» creado.`);
  };
  const onJoined = (group: Group) => {
    close();
    showToast(`Te uniste a «${group.name}».`);
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
      >
        <View>
          <Text style={[typography.headlineLarge, { color: colors.onSurface }]}>Mis grupos</Text>
          <Text style={[typography.bodyMedium, styles.subtitle]}>
            Consulta a quién tienes en cada grupo y en qué franjas coincidís todos.
          </Text>
          <View style={styles.actions}>
            <SecondaryButton title="Unirme" icon="vpn-key" style={styles.flex} onPress={() => setDialog('join')} />
            <PrimaryButton title="Crear grupo" icon="group-add" style={styles.flex} onPress={() => setDialog('create')} />
          </View>
        </View>
        <LoadState loading={loading} error={error} hasData={groups.length > 0} onRetry={() => void reload()}>
          {groups.length === 0 ? (
            <EmptyState
              title="Aún no tienes ningún grupo"
              description="Crea uno para invitar a tus compañeros, o únete con el código que te hayan pasado."
              icon="groups"
              actionLabel="Crear mi primer grupo"
              onAction={() => setDialog('create')}
            />
          ) : (
            <View style={styles.list}>
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onPress={() => navigation.navigate('GroupDetail', { groupId: group.id, name: group.name })}
                />
              ))}
            </View>
          )}
        </LoadState>
      </ScrollView>
      {dialog === 'create' ? <CreateGroupDialog submit={create} onDone={onCreated} onDismiss={close} /> : null}
      {dialog === 'join' ? <JoinGroupDialog submit={join} onDone={onJoined} onDismiss={close} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 12 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 8 },
  list: { gap: 12 },
  banner: { height: 100, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#FFFFFF' },
  cardBody: { paddingHorizontal: 16, paddingVertical: 12 },
  description: { color: colors.onSurfaceVariant, marginTop: 4 },
  count: { color: colors.onSurfaceVariant, marginTop: 8 },
});
