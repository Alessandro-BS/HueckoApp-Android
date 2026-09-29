import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LoadState } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useGroup } from '../../hooks/useGroup';
import type { AppStackScreen, GroupTabsParamList } from '../../navigation/types';
import { categoryColorFor, colors, typography } from '../../theme';
import { memberCountLabel } from '../../utils/groups';
import { showToast } from '../../utils/toast';
import { InviteCodeCard } from './InviteCodeCard';
import { AvailabilityTab } from './tabs/AvailabilityTab';
import { MembersTab } from './tabs/MembersTab';
import { PlansTab } from './tabs/PlansTab';

const Tabs = createMaterialTopTabNavigator<GroupTabsParamList>();

export function GroupDetailScreen({ navigation, route }: AppStackScreen<'GroupDetail'>) {
  const { groupId } = route.params;
  const { user } = useAuth();
  const { group, loading, error, reload, setEssential, leave } = useGroup(groupId);

  // La cabecera arranca con el nombre recibido y se actualiza si cambió en el servidor.
  useEffect(() => {
    if (group) navigation.setOptions({ title: group.name });
  }, [group?.name, navigation]);

  if (!group) {
    return (
      <View style={styles.centered}>
        <LoadState loading={loading} error={error ?? 'Grupo no encontrado.'} hasData={false} onRetry={() => void reload()}>
          {null}
        </LoadState>
      </View>
    );
  }

  const handleLeave = async () => {
    await leave();
    showToast(`Saliste de «${group.name}».`);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.banner, { backgroundColor: categoryColorFor(group.name) }]}>
        <Text style={styles.bannerInitial}>{group.name.trim().charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.header}>
        <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{group.name}</Text>
        {group.description ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{group.description}</Text>
        ) : null}
        <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{memberCountLabel(group.memberCount)}</Text>
        <InviteCodeCard code={group.inviteCode} />
      </View>
      <Tabs.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.onSurfaceVariant,
          tabBarIndicatorStyle: { backgroundColor: colors.primary },
          tabBarStyle: { backgroundColor: colors.surface },
          tabBarLabelStyle: { ...typography.labelLarge, textTransform: 'none' },
          sceneStyle: { backgroundColor: colors.surface },
        }}
      >
        <Tabs.Screen name="Plans" component={PlansTab} options={{ title: 'Planes' }} />
        <Tabs.Screen name="Availability" options={{ title: 'Huecos' }}>
          {() => <AvailabilityTab groupId={group.id} threshold={group.availabilityThreshold} memberCount={group.memberCount} />}
        </Tabs.Screen>
        <Tabs.Screen name="Members" options={{ title: 'Miembros' }}>
          {() => (
            <MembersTab group={group} currentUserId={user?.id ?? ''} onToggleEssential={setEssential} onLeave={handleLeave} />
          )}
        </Tabs.Screen>
      </Tabs.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  banner: { height: 120, alignItems: 'center', justifyContent: 'center' },
  bannerInitial: { fontSize: 45, lineHeight: 52, fontWeight: '400', color: '#FFFFFF' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
});
