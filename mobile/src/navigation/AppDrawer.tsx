import { MaterialIcons } from '@expo/vector-icons';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../components';
import { useAuth } from '../context/AuthContext';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { GroupListScreen } from '../screens/groups/GroupListScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { MyScheduleScreen } from '../screens/schedule/MyScheduleScreen';
import { categoryColor, colors, typography } from '../theme';
import type { DrawerParamList } from './types';

const Drawer = createDrawerNavigator<DrawerParamList>();

const icon = (name: keyof typeof MaterialIcons.glyphMap) => ({ color, size }: { color: string; size: number }) => (
  <MaterialIcons name={name} color={color} size={size} />
);

function DrawerContent(props: DrawerContentComponentProps) {
  const { user, logout } = useAuth();
  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.header}>
        <Avatar name={user?.name ?? 'H'} color={categoryColor(0)} size={48} />
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>
      <DrawerItemList {...props} />
      <DrawerItem
        label="Cerrar sesión"
        labelStyle={{ color: colors.error }}
        icon={({ size }) => <MaterialIcons name="logout" size={size} color={colors.error} />}
        onPress={() => void logout()}
      />
    </DrawerContentScrollView>
  );
}

export function AppDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      backBehavior="initialRoute"
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        headerShadowVisible: false,
        drawerActiveTintColor: colors.onPrimaryContainer,
        drawerActiveBackgroundColor: colors.primaryContainer,
        drawerInactiveTintColor: colors.onSurfaceVariant,
        drawerStyle: { backgroundColor: colors.surface },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Inicio', drawerIcon: icon('dashboard') }} />
      <Drawer.Screen name="Schedule" component={MyScheduleScreen} options={{ title: 'Horario', drawerIcon: icon('calendar-month') }} />
      <Drawer.Screen name="Groups" component={GroupListScreen} options={{ title: 'Grupos', drawerIcon: icon('group') }} />
      <Drawer.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil', drawerIcon: icon('person-outline') }} />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, paddingTop: 8, gap: 4, marginBottom: 8 },
  name: { ...typography.titleMedium, color: colors.onSurface, marginTop: 8 },
  email: { ...typography.bodySmall, color: colors.onSurfaceVariant },
});
