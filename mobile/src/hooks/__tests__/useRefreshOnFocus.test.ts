import { renderHook } from '@testing-library/react-native';

import { useRefreshOnFocus } from '../useRefreshOnFocus';

// Se captura el efecto que el hook registra para simular "la pantalla gana el foco".
const mockFocusEffects: Array<() => void> = [];
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => {
    mockFocusEffects.push(effect);
  },
}));

it('no recarga en el primer foco (ya cargó al montar) y sí al volver a la pantalla', async () => {
  const refresh = jest.fn();
  await renderHook(() => useRefreshOnFocus(refresh));
  mockFocusEffects.at(-1)!();
  expect(refresh).not.toHaveBeenCalled();
  mockFocusEffects.at(-1)!();
  expect(refresh).toHaveBeenCalledTimes(1);
});
