import type { AdminUserSummary } from '@hueckoapp/shared';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, EmptyState, HueckoCard, LoadState } from '../../../components';
import { useAdminUsers } from '../../../hooks/useAdminLists';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { categoryColorFor, colors, typography } from '../../../theme';
import { countLabel, ROLE_LABEL, STATUS_LABEL } from '../../../utils/admin';
import { Pager } from '../Pager';
import { SearchRow } from '../SearchRow';

function UserRow({ user, onPress }: { user: AdminUserSummary; onPress: () => void }) {
  return (
    <HueckoCard onPress={onPress}>
      <View style={styles.row}>
        <Avatar name={user.name} color={categoryColorFor(user.name)} size={40} />
        <View style={styles.flex}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{user.name}</Text>
          <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{user.email}</Text>
        </View>
        <View style={styles.badges}>
          {user.role === 'ADMIN' ? (
            <Badge text={ROLE_LABEL.ADMIN} containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
          ) : null}
          {user.status === 'SUSPENDED' ? (
            <Badge text={STATUS_LABEL.SUSPENDED} containerColor={colors.errorContainer} contentColor={colors.onErrorContainer} />
          ) : null}
        </View>
      </View>
    </HueckoCard>
  );
}

// «Usuarios»: todas las cuentas, las más nuevas primero; se abre el detalle para suspender o cambiar el rol.
export function UsersTab({ onOpen }: { onOpen: (user: AdminUserSummary) => void }) {
  const list = useAdminUsers();
  useRefreshOnFocus(list.reload); // al volver del detalle, con el estado nuevo
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
        placeholder="Nombre o correo"
        accessibilityLabel="Buscar usuarios"
      />
      <LoadState loading={list.loading} error={list.error} hasData={list.loaded} onRetry={() => void list.reload()}>
        {list.items.length === 0 ? (
          <EmptyState
            icon="person-search"
            title="Sin resultados"
            description={list.search ? `Ninguna cuenta coincide con «${list.search}».` : 'Todavía no hay cuentas.'}
          />
        ) : (
          <View style={styles.list}>
            <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{countLabel(list.total, 'cuenta', 'cuentas')}</Text>
            {list.items.map((user) => (
              <UserRow key={user.id} user={user} onPress={() => onOpen(user)} />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  badges: { gap: 4, alignItems: 'flex-end' },
});
