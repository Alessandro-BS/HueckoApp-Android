import type { OcrImage } from '../api/ai';
import type { DrawerScreenProps } from '@react-navigation/drawer';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type AuthStackParamList = { Login: undefined; Register: undefined };

export type DrawerParamList = {
  Dashboard: undefined;
  Schedule: undefined;
  Groups: undefined;
  Profile: undefined;
};

// Pantallas que se apilan sobre el drawer (sin menú, con cabecera nativa y botón atrás).
export type AppStackParamList = {
  Main: NavigatorScreenParams<DrawerParamList>;
  AddSchedule: { initialDay?: number } | undefined;
  OcrReview: { image: OcrImage };
  GroupDetail: { groupId: string; name: string };
  CreateProposal: { groupId: string; groupName: string };
  Voting: { proposalId: string };
  PlanDetail: { proposalId: string };
};

// Pestañas del detalle de grupo.
export type GroupTabsParamList = { Plans: undefined; Availability: undefined; Members: undefined };

export type AppStackScreen<K extends keyof AppStackParamList> = NativeStackScreenProps<AppStackParamList, K>;

// Pantallas del drawer que también abren pantallas apiladas (p. ej. Horario → Nuevo bloque).
export type DrawerScreen<K extends keyof DrawerParamList> = CompositeScreenProps<
  DrawerScreenProps<DrawerParamList, K>,
  NativeStackScreenProps<AppStackParamList>
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList, AuthStackParamList {}
  }
}
