import type { AuditEntry } from '@hueckoapp/shared';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, HueckoCard, LoadState } from '../../../components';
import { useAdminAudit } from '../../../hooks/useAdminLists';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { colors, typography } from '../../../theme';
import { AUDIT_ACTION_LABEL, auditAuthor, auditReason, auditTarget } from '../../../utils/admin';
import { formatDateTime } from '../../../utils/days';
import { Pager } from '../Pager';

function AuditRow({ entry }: { entry: AuditEntry }) {
  const reason = auditReason(entry);
  return (
    <HueckoCard>
      <View style={styles.body}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{AUDIT_ACTION_LABEL[entry.action]}</Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{auditTarget(entry)}</Text>
        {reason ? <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{`Motivo: ${reason}`}</Text> : null}
        <Text style={[typography.labelSmall, { color: colors.onSurfaceVariant }]}>
          {`${auditAuthor(entry)} · ${formatDateTime(new Date(entry.createdAt))}`}
        </Text>
      </View>
    </HueckoCard>
  );
}

// «Registro»: cada acción de administración, la más reciente primero (también las hechas desde la consola).
export function AuditTab() {
  const list = useAdminAudit();
  useRefreshOnFocus(list.reload);
  useRefreshErrorToast(list.error, list.loaded, list.failedLoads);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.reload()} colors={[colors.primary]} />}
    >
      <LoadState loading={list.loading} error={list.error} hasData={list.loaded} onRetry={() => void list.reload()}>
        {list.items.length === 0 ? (
          <EmptyState icon="history" title="Registro vacío" description="Todavía no hay acciones registradas." />
        ) : (
          <View style={styles.list}>
            {list.items.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
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
