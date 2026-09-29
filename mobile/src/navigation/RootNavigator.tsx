import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { AddScheduleScreen } from '../screens/schedule/AddScheduleScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { colors } from '../theme';
import { AppDrawer } from './AppDrawer';
import type { AppStackParamList, AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

// Cambiar de stack según la sesión borra el historial: tras cerrar sesión no se puede volver atrás.
export function RootNavigator() {
  const { status } = useAuth();
  if (status === 'loading') return <SplashScreen />;

  if (status === 'signedOut') {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
      </AuthStack.Navigator>
    );
  }

  return (
    <AppStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.surface },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        headerShadowVisible: false,
      }}
    >
      <AppStack.Screen name="Main" component={AppDrawer} options={{ headerShown: false }} />
      <AppStack.Screen name="AddSchedule" component={AddScheduleScreen} options={{ title: 'Nuevo bloque' }} />
    </AppStack.Navigator>
  );
}
