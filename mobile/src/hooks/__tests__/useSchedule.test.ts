import type { TimeBlock } from '@hueckoapp/shared';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as scheduleApi from '../../api/schedule';
import { useSchedule } from '../useSchedule';

jest.mock('../../api/schedule');
const mocked = scheduleApi as jest.Mocked<typeof scheduleApi>;

const block = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'b1', userId: 'u1', label: 'Clase', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null, ...over,
});

beforeEach(() => jest.clearAllMocks());

it('carga mis bloques', async () => {
  mocked.listTimeBlocks.mockResolvedValue([block({ id: 'b1' })]);
  const { result } = await renderHook(() => useSchedule());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.blocks).toEqual([block({ id: 'b1' })]);
});

it('removeBlock borra en el servidor y lo quita de la lista', async () => {
  mocked.listTimeBlocks.mockResolvedValue([block({ id: 'b1' }), block({ id: 'b2' })]);
  mocked.deleteTimeBlock.mockResolvedValue();
  const { result } = await renderHook(() => useSchedule());
  await waitFor(() => expect(result.current.blocks).toHaveLength(2));

  await act(async () => result.current.removeBlock('b1'));
  expect(mocked.deleteTimeBlock).toHaveBeenCalledWith('b1');
  expect(result.current.blocks.map((b) => b.id)).toEqual(['b2']);
});

it('si el borrado falla, lanza y no toca la lista', async () => {
  mocked.listTimeBlocks.mockResolvedValue([block({ id: 'b1' })]);
  mocked.deleteTimeBlock.mockRejectedValue(new ApiError(404, 'TIME_BLOCK_NOT_FOUND', 'Bloque no encontrado.'));
  const { result } = await renderHook(() => useSchedule());
  await waitFor(() => expect(result.current.blocks).toHaveLength(1));

  await act(async () => {
    await expect(result.current.removeBlock('b1')).rejects.toMatchObject({ code: 'TIME_BLOCK_NOT_FOUND' });
  });
  expect(result.current.blocks).toHaveLength(1);
});
