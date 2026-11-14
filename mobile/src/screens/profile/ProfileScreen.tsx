import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Avatar, HueckoCard, SecondaryButton } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useAppActive } from '../../hooks/useAppActive';
import { isExpoGo, registerDevice, unregisterDevice } from '../../notifications/registration';
import { notificationsPreference } from '../../storage/appStorage';
import { categoryColor, colors, typography } from '../../theme';

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const expoGo = isExpoGo();
  const [enabled, setEnabled] = useState(false);
  const [denied, setDenied] = useState(false);

  const active = useAppActive();

  // Al abrir y al volver a primer plano (p. ej. de los ajustes del teléfono): el interruptor refleja la preferencia
  // guardada y el permiso real de Android; sin permiso sale apagado y con el aviso de «Abrir ajustes».
  useEffect(() => {
    if (expoGo || !active) return;
    let cancelled = false;
    void (async () => {
      const [preference, permission] = await Promise.all([notificationsPreference.get(), Notifications.getPermissionsAsync()]);
      if (cancelled) return;
      setEnabled(preference && permission.granted);
      setDenied(!permission.granted);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, expoGo]);

  const toggleNotifications = async (value: boolean) => {
    setDenied(false);
    if (!value) {
      setEnabled(false);
      await notificationsPreference.set(false);
      await unregisterDevice();
      return;
    }
    setEnabled(true);
    await notificationsPreference.set(true);
    if ((await registerDevice()) === 'denied') {
      setEnabled(false);
      setDenied(true);
      await notificationsPreference.set(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={[typography.headlineLarge, { color: colors.onSurface }]}>Mi perfil</Text>
      <HueckoCard>
        <View style={styles.row}>
          <Avatar name={user?.name || 'H'} color={categoryColor(0)} size={48} />
          <View style={styles.flex}>
            <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>Sesión iniciada</Text>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{user?.name}</Text>
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{user?.email ?? 'Sin correo registrado'}</Text>
          </View>
        </View>
        <View style={{ height: 20 }} />
        <SecondaryButton title="Cerrar sesión" color={colors.error} onPress={() => void logout()} />
      </HueckoCard>
      <HueckoCard>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Notificaciones en este celular</Text>
            {expoGo ? (
              <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>Disponible en la app instalada (APK)</Text>
            ) : null}
          </View>
          <Switch
            accessibilityLabel="Notificaciones en este celular"
            value={enabled && !expoGo}
            disabled={expoGo}
            onValueChange={(value) => void toggleNotifications(value)}
          />
        </View>
        {denied ? (
          <>
            <View style={{ height: 12 }} />
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
              Activa las notificaciones de HueckoApp en los ajustes del teléfono
            </Text>
            <View style={{ height: 12 }} />
            <SecondaryButton title="Abrir ajustes" onPress={() => void Linking.openSettings()} />
          </>
        ) : null}
      </HueckoCard>
      <HueckoCard containerColor={colors.surfaceContainer} borderColor={colors.surfaceContainer}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Próximamente</Text>
        <View style={{ height: 6 }} />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Datos de la cuenta y ajustes de privacidad.
        </Text>
      </HueckoCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
