import type { AdminGroupSummary } from '@hueckoapp/shared';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, HueckoCard, LoadState } from '../../../components';
import { useAdminGroups } from '../../../hooks/useAdminLists';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { colors, typography } from '../../../theme';
import { countLabel } from '../../../utils/admin';
import { memberCountLabel } from '../../../utils/groups';
import { Pager } from '../Pager';
import { SearchRow } from '../SearchRow';

function GroupRow({ group, onPress }: { group: AdminGroupSummary; onPress: () => void }) {
  return (
    <HueckoCard onPress={onPress}>
      <View style={styles.body}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{group.name}</Text>
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
          {`${memberCountLabel(group.memberCount)} · ${countLabel(group.proposalCount, 'propuesta', 'propuestas')}`}
        </Text>
        <Text style={[typography.labelSmall, { color: colors.onSurfaceVariant }]}>
          {group.owner ? `Administra: ${group.owner.name}` : 'Sin administrador'}
        </Text>
      </View>
    </HueckoCard>
  );
}

// «Grupos»: todos los grupos de la app (sin ser miembro); el detalle permite borrar y moderar propuestas.
export function GroupsTab({ onOpen }: { onOpen: (group: AdminGroupSummary) => void }) {
  const list = useAdminGroups();
  useRefreshOnFocus(list.reload); // al volver de borrar un grupo, ya no aparece
  useRefreshErrorToast(list.error, list.loaded, list.failedLoads);
  const [text, setText] = useState('');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.reload()} colors={[colors.primary]} />}
    >
      <SearchRow
        value={text}
        onChangeText={setText}
        onSearch={() => list.applySearch(text)}
        placeholder="Nombre o código"
        accessibilityLabel="Buscar grupos"
      />
      <LoadState loading={list.loading} error={list.error} hasData={list.loaded} onRetry={() => void list.reload()}>
        {list.items.length === 0 ? (
          <EmptyState
            icon="group-off"
            title="Sin resultados"
            description={list.search ? `Ningún grupo coincide con «${list.search}».` : 'Todavía no hay grupos.'}
          />
        ) : (
          <View style={styles.list}>
            <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{countLabel(list.total, 'grupo', 'grupos')}</Text>
            {list.items.map((group) => (
              <GroupRow key={group.id} group={group} onPress={() => onOpen(group)} />
            ))}
          </View>
        )}
        <Pager page={list.page} pageCount={list.pageCount} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prevPage} onNext={list.nextPage} />
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  list: { gap: 8 },
  body: { gap: 4 },
});
