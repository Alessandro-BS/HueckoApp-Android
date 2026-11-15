import { createNavigationContainerRef } from '@react-navigation/native';

import type { AppStackParamList } from './types';

// Para navegar desde fuera de una pantalla (p. ej. al tocar un aviso push). `Voting` y `PlanDetail` están en el stack raíz.
export const navigationRef = createNavigationContainerRef<AppStackParamList>();
