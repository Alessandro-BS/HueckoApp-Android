import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = { Login: undefined; Register: undefined };

export type DrawerParamList = {
  Dashboard: undefined;
  Schedule: undefined;
  Groups: undefined;
  Profile: undefined;
};

// Pantallas que se apilan sobre el drawer (sin menú). Se completan en fases siguientes.
export type AppStackParamList = {
  Main: NavigatorScreenParams<DrawerParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList, AuthStackParamList {}
  }
}
