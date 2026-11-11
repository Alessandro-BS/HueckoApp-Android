import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

// Sin estado conocido (null en algunos arranques) cuenta como en primer plano.
const isActive = (state: AppStateStatus | null | undefined) => state !== 'background' && state !== 'inactive';

// true mientras la app está en primer plano. Con la pantalla bloqueada o la app en segundo plano el foco de la
// navegación no cambia: los sensores lo usan para no seguir escuchando en el bolsillo.
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => isActive(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(isActive(state)));
    return () => subscription.remove();
  }, []);
  return active;
}
