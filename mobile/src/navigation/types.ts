import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { DrawerScreenProps } from '@react-navigation/drawer';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { OcrImage } from '../api/ai';
import type { ProposalPrefill } from '../utils/ai';

export type AuthStackParamList = { Login: undefined; Register: undefined };

// Barra inferior: las secciones de uso diario.
export type TabParamList = {
  Dashboard: undefined;
  Schedule: undefined;
  Groups: undefined;
};

// Drawer: «Inicio» es la barra inferior; Administración y Perfil se abren desde el menú ☰.
export type DrawerParamList = {
  Home: NavigatorScreenParams<TabParamList>;
  Admin: undefined;
  Profile: undefined;
};

// Pantallas que se apilan sobre el drawer (sin menú, con cabecera nativa y botón atrás).
export type AppStackParamList = {
  Main: NavigatorScreenParams<DrawerParamList>;
  AddSchedule: { initialDay?: number } | undefined;
  OcrReview: { image: OcrImage };
  GroupDetail: { groupId: string; name: string };
  // `prefill`: borrador o idea de Huecko IA que abre el formulario ya rellenado.
  CreateProposal: { groupId: string; groupName: string; prefill?: ProposalPrefill };
  Voting: { proposalId: string };
  PlanDetail: { proposalId: string };
  // Administración (solo rol ADMIN): detalles que se abren desde las pestañas Usuarios y Grupos.
  AdminUserDetail: { userId: string; name: string };
  AdminGroupDetail: { groupId: string; name: string };
};

// Pestañas del detalle de grupo.
export type GroupTabsParamList = { Plans: undefined; Availability: undefined; Members: undefined };

// Pestañas del panel de administración (solo rol ADMIN).
export type AdminTabsParamList = { Stats: undefined; Reports: undefined; Users: undefined; Groups: undefined; Audit: undefined };

export type AppStackScreen<K extends keyof AppStackParamList> = NativeStackScreenProps<AppStackParamList, K>;

// Pantallas del drawer que también abren pantallas apiladas (p. ej. Administración → detalle de un usuario).
export type DrawerScreen<K extends keyof DrawerParamList> = CompositeScreenProps<
  DrawerScreenProps<DrawerParamList, K>,
  NativeStackScreenProps<AppStackParamList>
>;

// Pestañas de la barra inferior, que también abren pantallas apiladas (p. ej. Horario → Nuevo bloque).
export type TabScreen<K extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, K>,
  CompositeScreenProps<DrawerScreenProps<DrawerParamList>, NativeStackScreenProps<AppStackParamList>>
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList, AuthStackParamList {}
  }
}
