import { fireEvent, render, screen } from '@testing-library/react-native';

import { DateTimeField } from '../DateTimeField';

jest.mock('../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

it('sin valor muestra el texto de ayuda y no abre el selector hasta pulsar', async () => {
  await render(<DateTimeField label="Fecha límite de votación" value={null} onChange={jest.fn()} placeholder="Elige fecha y hora" />);
  expect(screen.getByText('Elige fecha y hora')).toBeTruthy();
  expect(screen.queryByTestId('datetimepicker-date')).toBeNull();
});

it('fecha y hora: pide la fecha, después la hora, y devuelve ambas juntas', async () => {
  const onChange = jest.fn();
  const min = new Date(2026, 8, 29, 10, 0);
  await render(<DateTimeField label="Fecha límite de votación" value={null} onChange={onChange} minimumDate={min} />);
  await fireEvent.press(screen.getByLabelText('Fecha límite de votación'));
  const datePicker = screen.getByTestId('datetimepicker-date');
  expect(datePicker.props.minimumDate).toEqual(min);
  await fireEvent(datePicker, 'change', { type: 'set' }, new Date(2026, 9, 2, 0, 0));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent(screen.getByTestId('datetimepicker-time'), 'change', { type: 'set' }, new Date(2026, 8, 29, 20, 30));
  expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 2, 20, 30));
  expect(screen.queryByTestId('datetimepicker-time')).toBeNull();
});

it('solo fecha: devuelve la medianoche del día elegido', async () => {
  const onChange = jest.fn();
  await render(<DateTimeField label="Fecha" mode="date" value={new Date(2026, 8, 29)} onChange={onChange} />);
  expect(screen.getByText('Mar 29 sep')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Fecha'));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'set' }, new Date(2026, 9, 2, 15, 45));
  expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 2));
  expect(screen.queryByTestId('datetimepicker-time')).toBeNull();
});

it('cerrar el selector sin elegir no cambia nada', async () => {
  const onChange = jest.fn();
  await render(<DateTimeField label="Fecha límite de votación" value={null} onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText('Fecha límite de votación'));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'dismissed' });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByTestId('datetimepicker-date')).toBeNull();
});

it('muestra el valor con fecha y hora, y el error', async () => {
  await render(
    <DateTimeField label="Fecha límite de votación" value={new Date(2026, 9, 2, 20, 0)} onChange={jest.fn()} error="La fecha límite debe ser futura" />,
  );
  expect(screen.getByText('Vie 2 oct, 20:00')).toBeTruthy();
  expect(screen.getByText('La fecha límite debe ser futura')).toBeTruthy();
});
