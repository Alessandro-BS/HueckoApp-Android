import { fireEvent, render, screen } from '@testing-library/react-native';

import { BottomSheet, DaySelector, EmptyState, PrimaryButton, ProposalStateBadge, SecondaryButton, TextField } from '..';

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

describe('accessibilityLabel opcional en los botones', () => {
  it('si se pasa, es el nombre accesible; si no, el nombre es el título', async () => {
    await render(
      <>
        <PrimaryButton title="Usar" accessibilityLabel="Usar «Karaoke»" onPress={() => {}} />
        <SecondaryButton title="Quitar" accessibilityLabel="Quitar «Karaoke»" onPress={() => {}} />
        <PrimaryButton title="Guardar" onPress={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Usar «Karaoke»' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitar «Karaoke»' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
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

describe('SecondaryButton', () => {
  it('responde si está habilitado y no si está deshabilitado', async () => {
    const onPress = jest.fn();
    await render(<SecondaryButton title="Añadir franja" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Añadir franja'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await render(<SecondaryButton title="Añadir otra" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByText('Añadir otra'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ProposalStateBadge', () => {
  it('pinta el estado con tildes', async () => {
    await render(<ProposalStateBadge state="PROPUESTO" />);
    expect(screen.getByText('En votación')).toBeTruthy();
  });
});

describe('DaySelector', () => {
  it('con subtítulo vacío no deja «, » en la etiqueta de accesibilidad', async () => {
    await render(<DaySelector selected={1} onSelect={() => {}} captionFor={(iso) => (iso === 2 ? '3 bloques' : '')} />);
    expect(screen.getByLabelText('Lunes')).toBeTruthy();
    expect(screen.getByLabelText('Martes, 3 bloques')).toBeTruthy();
    expect(screen.queryByLabelText('Lunes, ')).toBeNull();
  });
});

describe('BottomSheet', () => {
  // La hoja lleva accessibilityViewIsModal (iOS oculta lo de fuera); en Android TalkBack sí llega al fondo,
  // así que se busca incluyendo los elementos ocultos.
  it('el fondo es un botón «Cerrar» que cierra la hoja', async () => {
    const onDismiss = jest.fn();
    await render(<BottomSheet title="Agregar franja" onDismiss={onDismiss}>{null}</BottomSheet>);
    const backdrop = screen.getByLabelText('Cerrar', { includeHiddenElements: true });
    expect(backdrop.props.accessibilityRole).toBe('button');
    expect(backdrop.props.accessibilityState).toEqual({ disabled: false });
    await fireEvent.press(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('mientras no se puede cerrar, el fondo se anuncia deshabilitado y no cierra', async () => {
    const onDismiss = jest.fn();
    await render(<BottomSheet title="Agregar franja" onDismiss={onDismiss} dismissable={false}>{null}</BottomSheet>);
    const backdrop = screen.getByLabelText('Cerrar', { includeHiddenElements: true });
    expect(backdrop.props.accessibilityRole).toBe('button');
    expect(backdrop.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(backdrop);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('TextField multiline', () => {
  it('pasa multiline al campo', async () => {
    await render(<TextField label="Describe tu plan" value="" onChangeText={() => {}} multiline />);
    expect(screen.getByLabelText('Describe tu plan').props.multiline).toBe(true);
  });
});
