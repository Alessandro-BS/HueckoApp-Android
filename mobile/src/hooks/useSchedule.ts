import type { TimeBlock } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { deleteTimeBlock, listTimeBlocks } from '../api/schedule';
import { useResource } from './useResource';

const NO_BLOCKS: TimeBlock[] = [];

// Mi horario: la lista de bloques y cómo borrarlos. Crear se hace en AddSchedule con useAction.
export function useSchedule() {
  const { data, loading, refreshing, error, reload, mutate } = useResource(listTimeBlocks);

  // Lanza si falla: la pantalla decide cómo avisar.
  const removeBlock = useCallback(
    async (id: string) => {
      await deleteTimeBlock(id);
      mutate((prev) => prev?.filter((b) => b.id !== id));
    },
    [mutate],
  );

  return { blocks: data ?? NO_BLOCKS, loading, refreshing, error, reload, removeBlock };
}
