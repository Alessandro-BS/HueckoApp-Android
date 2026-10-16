import { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Avatar, Badge, ErrorBanner, LoadState, PrimaryButton, SecondaryButton, SectionHeader, StatTile,
} from '../../components';
import { useAuth } from '../../context/AuthContext';
import type { ActionResult } from '../../hooks/useAction';
import { useAdminUser } from '../../hooks/useAdminUser';
import type { AppStackScreen } from '../../navigation/types';
import { categoryColorFor, colors, typography } from '../../theme';
import { ROLE_LABEL, STATUS_LABEL } from '../../utils/admin';
import { formatDateLabel, toDateKey } from '../../utils/days';
import { showToast } from '../../utils/toast';

// Confirmación de las acciones que quitan acceso o dan poder (la reactivación va sin preguntar).
const confirm = (title: string, message: string, label: string, onConfirm: () => void) =>
  Alert.alert(title, message, [
    { text: 'Volver', style: 'cancel' },
    { text: label, style: 'destructive', onPress: onConfirm },
  ]);

export function AdminUserDetailScreen({ navigation, route }: AppStackScreen<'AdminUserDetail'>) {
  const { userId } = route.params;
  const { user: me } = useAuth();
  const { user, loading, error, reload, setStatus, setRole, saving, actionError } = useAdminUser(userId);

  const name = user?.name;
  useEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [name, navigation]);

  if (!user) {
    return (
      <View style={styles.centered}>
        <LoadState loading={loading} error={error ?? 'Usuario no encontrado.'} hasData={false} onRetry={() => void reload()}>
          {null}
        </LoadState>
      </View>
    );
  }

  // El servidor también lo impide (409 CANNOT_CHANGE_SELF); aquí ni se ofrece.
  const isMe = me?.id === user.id;
  const run = async (action: Promise<ActionResult<unknown>>, done: string) => {
    if ((await action).ok) showToast(done);
  };

  const suspend = () =>
    confirm('Suspender cuenta', `${user.name} no podrá entrar ni usar la app hasta que la reactives. Sus grupos y planes no se borran.`, 'Suspender', () =>
      void run(setStatus('SUSPENDED'), 'Cuenta suspendida.'),
    );
  const reactivate = () => void run(setStatus('ACTIVE'), 'Cuenta reactivada.');
  const promote = () =>
    confirm('Nombrar administrador', `${user.name} podrá ver las estadísticas, suspender cuentas y borrar grupos.`, 'Nombrar', () =>
      void run(setRole('ADMIN'), `${user.name} ahora es administrador.`),
    );
  const demote = () =>
    confirm('Quitar rol de administrador', `${user.name} dejará de ver «Administración».`, 'Quitar rol', () =>
      void run(setRole('USER'), `${user.name} ya no es administrador.`),
    );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Avatar name={user.name} color={categoryColorFor(user.name)} size={56} />
        <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{user.name}</Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{user.email}</Text>
        <View style={styles.badges}>
          <Badge text={ROLE_LABEL[user.role]} containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
          <Badge
            text={STATUS_LABEL[user.status]}
            containerColor={user.status === 'ACTIVE' ? colors.successContainer : colors.errorContainer}
            contentColor={user.status === 'ACTIVE' ? colors.onSuccessContainer : colors.onErrorContainer}
          />
        </View>
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
          {`Cuenta creada el ${formatDateLabel(toDateKey(new Date(user.createdAt)))}`}
        </Text>
      </View>

      <SectionHeader title="Actividad" />
      <View style={styles.tiles}>
        <StatTile label="Propuestas creadas" value={user.activity.proposalsCreated} />
        <StatTile label="Votos" value={user.activity.votes} />
        <StatTile label="Incidencias" value={user.activity.incidences} />
        <StatTile label="Bloques de horario" value={user.activity.timeBlocks} />
        <StatTile label="Llamadas a la IA" value={user.activity.aiCalls} />
      </View>

      <SectionHeader title="Grupos" />
      {user.groups.length === 0 ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>No pertenece a ningún grupo.</Text>
      ) : (
        user.groups.map((g) => (
          <Text key={g.id} style={[typography.bodyMedium, { color: colors.onSurface }]}>
            {`${g.name} · ${g.role === 'OWNER' ? 'Administra el grupo' : 'Miembro'}`}
          </Text>
        ))
      )}

      <SectionHeader title="Acciones" />
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {isMe ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Es tu cuenta: no puedes suspenderla ni quitarte el rol de administrador.
        </Text>
      ) : (
        <View style={styles.actions}>
          {user.status === 'ACTIVE' ? (
            <SecondaryButton title="Suspender cuenta" icon="block" color={colors.error} disabled={saving} onPress={suspend} />
          ) : (
            <PrimaryButton title="Reactivar cuenta" icon="check-circle" loading={saving} onPress={reactivate} />
          )}
          {user.role === 'USER' ? (
            <SecondaryButton title="Nombrar administrador" icon="admin-panel-settings" disabled={saving} onPress={promote} />
          ) : (
            <SecondaryButton title="Quitar rol de administrador" icon="remove-moderator" disabled={saving} onPress={demote} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  header: { alignItems: 'center', gap: 6 },
  badges: { flexDirection: 'row', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { gap: 10 },
});
