import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as groupsApi from '../../../api/groups';
import { AvailabilityTab } from '../tabs/AvailabilityTab';

jest.mock('../../../api/groups');
const mocked = groupsApi as jest.Mocked<typeof groupsApi>;

beforeEach(() => jest.clearAllMocks());

it('muestra las franjas agrupadas por día con su % y los libres', async () => {
  mocked.getAvailability.mockResolvedValue([
    { dayOfWeek: 1, startTime: '12:00', endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 },
    { dayOfWeek: 3, startTime: '08:00', endTime: '14:00', availabilityPercentage: 100, freeMembers: 2 },
    { dayOfWeek: 3, startTime: '19:00', endTime: '20:00', availabilityPercentage: 50, freeMembers: 1 },
  ]);
  await render(<AvailabilityTab groupId="g1" threshold={50} memberCount={2} />);
  expect(await screen.findByText('Lunes')).toBeTruthy();
  expect(screen.getByText('Miércoles')).toBeTruthy();
  expect(screen.queryByText('Martes')).toBeNull();
  expect(screen.getByText('08:00 - 14:00')).toBeTruthy();
  expect(screen.getByText('50%')).toBeTruthy();
  expect(screen.getByText('1 de 2 libres')).toBeTruthy();
  expect(mocked.getAvailability).toHaveBeenCalledWith('g1');
});

it('sin franjas explica el umbral', async () => {
  mocked.getAvailability.mockResolvedValue([]);
  await render(<AvailabilityTab groupId="g1" threshold={80} memberCount={2} />);
  expect(await screen.findByText('Sin huecos en común')).toBeTruthy();
  expect(screen.getByText('Ninguna franja alcanza el 80% de disponibilidad que pide el grupo.')).toBeTruthy();
});

it('si falla sin datos muestra el error y Reintentar recupera las franjas', async () => {
  mocked.getAvailability.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Algo falló.'));
  mocked.getAvailability.mockResolvedValueOnce([
    { dayOfWeek: 2, startTime: '10:00', endTime: '12:00', availabilityPercentage: 100, freeMembers: 2 },
  ]);
  await render(<AvailabilityTab groupId="g1" threshold={80} memberCount={2} />);
  expect(await screen.findByText('Algo falló.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText('Martes')).toBeTruthy();
});
