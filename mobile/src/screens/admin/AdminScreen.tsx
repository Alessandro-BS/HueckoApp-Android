import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

import type { AdminTabsParamList, DrawerScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { ReportsTab } from './tabs/ReportsTab';
import { StatsTab } from './tabs/StatsTab';

const Tabs = createMaterialTopTabNavigator<AdminTabsParamList>();

// Panel «Administración» (D12): pestañas desplazables, con el mismo estilo que el detalle de un grupo.
// Solo aparece en el drawer con rol ADMIN; el servidor lo vuelve a comprobar en cada petición (403 NOT_ADMIN).
export function AdminScreen(_props: DrawerScreen<'Admin'>) {
  return (
    <Tabs.Navigator
      screenOptions={{
        tabBarScrollEnabled: true,
        tabBarItemStyle: { width: 'auto', minWidth: 110 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarIndicatorStyle: { backgroundColor: colors.primary },
        tabBarStyle: { backgroundColor: colors.surface },
        tabBarLabelStyle: { ...typography.labelLarge, textTransform: 'none' },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="Stats" component={StatsTab} options={{ title: 'Estadísticas' }} />
      <Tabs.Screen name="Reports" component={ReportsTab} options={{ title: 'Informes' }} />
    </Tabs.Navigator>
  );
}
