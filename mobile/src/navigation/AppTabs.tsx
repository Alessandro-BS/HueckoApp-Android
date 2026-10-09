import { MaterialIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DrawerToggleButton } from '@react-navigation/drawer';

import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { GroupListScreen } from '../screens/groups/GroupListScreen';
import { MyScheduleScreen } from '../screens/schedule/MyScheduleScreen';
import { colors } from '../theme';
import type { TabParamList } from './types';

const Tabs = createBottomTabNavigator<TabParamList>();

const icon = (name: keyof typeof MaterialIcons.glyphMap) => ({ color, size }: { color: string; size: number }) => (
  <MaterialIcons name={name} color={color} size={size} />
);

// Barra inferior con las secciones de uso diario. El botón ☰ de la cabecera abre el drawer
// (Perfil, Administración y Cerrar sesión).
export function AppTabs() {
  return (
    <Tabs.Navigator
      initialRouteName="Dashboard"
      backBehavior="initialRoute"
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        headerShadowVisible: false,
        headerLeft: () => <DrawerToggleButton tintColor={colors.onSurface} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Inicio', tabBarIcon: icon('dashboard') }} />
      <Tabs.Screen name="Schedule" component={MyScheduleScreen} options={{ title: 'Horario', tabBarIcon: icon('calendar-month') }} />
      <Tabs.Screen name="Groups" component={GroupListScreen} options={{ title: 'Grupos', tabBarIcon: icon('group') }} />
    </Tabs.Navigator>
  );
}
