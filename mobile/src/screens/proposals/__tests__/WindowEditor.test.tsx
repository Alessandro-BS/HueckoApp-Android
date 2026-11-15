import { fireEvent, render, screen } from '@testing-library/react-native';

import { WindowEditor } from '../WindowEditor';

const NOW = new Date('2026-09-29T15:00:00Z'); // martes 29/09 10:00 en Lima
const WEEK = '2026-09-28';

it('en la semana actual los días pasados están desactivados', async () => {
  const onSubmit = jest.fn();
  await render(<WindowEditor week={WEEK} now={NOW} submitLabel="Añadir" onSubmit={onSubmit} />);
  expect(screen.getByRole('button', { name: /^Lunes/ }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('button', { name: /^Martes/ }).props.accessibilityState.disabled).toBeFalsy();
  // Un día pasado no se puede elegir aunque se toque.
  await fireEvent.press(screen.getByRole('button', { name: /^Lunes/ }));
  expect(screen.getByText('Mar 29 sep')).toBeTruthy();
});

it('en una semana futura todos los días están disponibles', async () => {
  await render(<WindowEditor week="2026-10-05" now={NOW} submitLabel="Añadir" onSubmit={jest.fn()} />);
  expect(screen.getByRole('button', { name: /^Lunes/ }).props.accessibilityState.disabled).toBeFalsy();
  expect(screen.getByText('Lun 5 oct')).toBeTruthy();
});

it('la franja enviada lleva date = dateFor(week, día)', async () => {
  const onSubmit = jest.fn();
  await render(<WindowEditor week={WEEK} now={NOW} submitLabel="Añadir" onSubmit={onSubmit} />);
  await fireEvent.press(screen.getByRole('button', { name: /^Viernes/ }));
  expect(screen.getByText('Vie 2 oct')).toBeTruthy();
  await fireEvent.press(screen.getByText('Añadir'));
  expect(onSubmit).toHaveBeenCalledWith({ date: '2026-10-02', startTime: '09:00', endTime: '11:00' });
});

it('una hora de inicio que ya pasó hoy no se puede enviar', async () => {
  const onSubmit = jest.fn();
  await render(<WindowEditor week={WEEK} now={NOW} submitLabel="Añadir" onSubmit={onSubmit} />);
  // Martes 29 a las 09:00 ya empezó (son las 10:00).
  expect(screen.getByText('Esa franja ya empezó.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Añadir'));
  expect(onSubmit).not.toHaveBeenCalled();
});

it('con notBefore, una franja que empieza antes de ese instante no se envía', async () => {
  const onSubmit = jest.fn();
  const deadline = new Date('2026-10-02T14:00:00Z'); // viernes 09:00 en Lima
  await render(<WindowEditor week={WEEK} now={NOW} notBefore={deadline} submitLabel="Añadir" onSubmit={onSubmit} />);
  await fireEvent.press(screen.getByRole('button', { name: /^Viernes/ }));
  expect(screen.getByText('Debe empezar después del cierre de la votación.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Añadir'));
  expect(onSubmit).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Hora de inicio (HH:mm)'), '10:00');
  await fireEvent.press(screen.getByText('Añadir'));
  expect(onSubmit).toHaveBeenCalledWith({ date: '2026-10-02', startTime: '10:00', endTime: '11:00' });
});
