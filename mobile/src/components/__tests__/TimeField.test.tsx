import { fireEvent, render, screen } from '@testing-library/react-native';

import { TimeField } from '../TimeField';

jest.mock('../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

it('muestra la hora y no abre el reloj hasta pulsar', async () => {
  await render(<TimeField label="Inicio" value="08:00" onChange={jest.fn()} />);
  expect(screen.getByText('08:00')).toBeTruthy();
  expect(screen.queryByTestId('datetimepicker-time')).toBeNull();
});

it('abre el reloj de 24 h en la hora actual del campo y devuelve «HH:mm» con dos dígitos', async () => {
  const onChange = jest.fn();
  await render(<TimeField label="Inicio" value="14:30" onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText('Inicio'));
  const picker = screen.getByTestId('datetimepicker-time');
  expect(picker.props.is24Hour).toBe(true);
  expect(picker.props.value.getHours()).toBe(14);
  expect(picker.props.value.getMinutes()).toBe(30);
  await fireEvent(picker, 'change', { type: 'set' }, new Date(2026, 8, 29, 7, 5));
  expect(onChange).toHaveBeenCalledWith('07:05');
  expect(screen.queryByTestId('datetimepicker-time')).toBeNull();
});

it('con una hora inválida (p. ej. leída mal por la IA) la muestra y el reloj abre en 08:00', async () => {
  await render(<TimeField label="Inicio" value="8:5" onChange={jest.fn()} error="Formato HH:mm" />);
  expect(screen.getByText('8:5')).toBeTruthy();
  expect(screen.getByText('Formato HH:mm')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Inicio'));
  const value = screen.getByTestId('datetimepicker-time').props.value;
  expect([value.getHours(), value.getMinutes()]).toEqual([8, 0]);
});

it('cerrar el reloj sin elegir no cambia nada', async () => {
  const onChange = jest.fn();
  await render(<TimeField label="Fin" value="09:00" onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText('Fin'));
  await fireEvent(screen.getByTestId('datetimepicker-time'), 'change', { type: 'dismissed' });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByTestId('datetimepicker-time')).toBeNull();
});

it('usa accessibilityLabel si se pasa (varios campos con la misma etiqueta visible)', async () => {
  await render(<TimeField label="Inicio" accessibilityLabel="Inicio del bloque 2" value="08:00" onChange={jest.fn()} helperText="Inicio" />);
  expect(screen.getByLabelText('Inicio del bloque 2')).toBeTruthy();
});
