import { fireEvent, render, screen } from '@testing-library/react-native';

import { EmptyState, PrimaryButton, TextField } from '..';

describe('PrimaryButton', () => {
  it('llama a onPress', async () => {
    const onPress = jest.fn();
    await render(<PrimaryButton title="Iniciar sesión" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Iniciar sesión'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('en loading muestra el texto de carga y no responde', async () => {
    const onPress = jest.fn();
    await render(<PrimaryButton title="Iniciar sesión" loadingTitle="Iniciando sesión…" loading onPress={onPress} />);
    expect(screen.getByText('Iniciando sesión…')).toBeTruthy();
    await fireEvent.press(screen.getByText('Iniciando sesión…'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('muestra el error y alterna la visibilidad de la contraseña', async () => {
    await render(<TextField label="Contraseña" value="x" onChangeText={() => {}} error="Mínimo 8 caracteres" secureToggle />);
    expect(screen.getByText('Mínimo 8 caracteres')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mostrar contraseña'));
    expect(screen.getByLabelText('Ocultar contraseña')).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('muestra la acción si se pasa', async () => {
    const onAction = jest.fn();
    await render(<EmptyState title="Sin grupos" description="Crea uno" actionLabel="Crear grupo" onAction={onAction} />);
    await fireEvent.press(screen.getByText('Crear grupo'));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('TextField con pista', () => {
  it('muestra helperText sin error; el error la reemplaza; sin label usa accessibilityLabel', async () => {
    const { rerender } = await render(
      <TextField accessibilityLabel="Hora de inicio" value="08:00" onChangeText={() => {}} helperText="Inicio" />,
    );
    expect(screen.getByText('Inicio')).toBeTruthy();
    expect(screen.getByLabelText('Hora de inicio')).toBeTruthy();
    await rerender(
      <TextField accessibilityLabel="Hora de inicio" value="8:00" onChangeText={() => {}} helperText="Inicio" error="Formato HH:mm" />,
    );
    expect(screen.queryByText('Inicio')).toBeNull();
    expect(screen.getByText('Formato HH:mm')).toBeTruthy();
  });
});
