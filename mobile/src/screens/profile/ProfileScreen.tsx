import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, HueckoCard, SecondaryButton } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { categoryColor, colors, typography } from '../../theme';

export function ProfileScreen() {
  const { user, logout } = useAuth();
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
      <HueckoCard containerColor={colors.surfaceContainer} borderColor={colors.surfaceContainer}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Próximamente</Text>
        <View style={{ height: 6 }} />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Datos de la cuenta, preferencias de notificación y ajustes de privacidad.
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
