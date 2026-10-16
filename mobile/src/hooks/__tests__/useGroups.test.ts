import type { Group, GroupMember, GroupSummary } from '@hueckoapp/shared';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as groupsApi from '../../api/groups';
import { useAvailability } from '../useAvailability';
import { useGroup } from '../useGroup';
import { useGroups } from '../useGroups';

jest.mock('../../api/groups');
const mocked = groupsApi as jest.Mocked<typeof groupsApi>;

const owner: GroupMember = { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com', role: 'OWNER', isEssential: false };
const ana: GroupMember = { id: 'u2', name: 'Ana', email: 'ana@test.com', role: 'MEMBER', isEssential: false };
const summary: GroupSummary = { id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 2, availabilityThreshold: 80 };
const group = (over: Partial<Group> = {}): Group => ({ ...summary, inviteCode: 'PROY2026', members: [owner, ana], ...over });

beforeEach(() => jest.clearAllMocks());

describe('useGroups', () => {
  it('carga mis grupos', async () => {
    mocked.listGroups.mockResolvedValue([summary]);
    const { result } = await renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([summary]);
  });

  it('loaded distingue «sin cargar» de «cargado y vacío»', async () => {
    let finish!: (groups: GroupSummary[]) => void;
    mocked.listGroups.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = await renderHook(() => useGroups());
    expect(result.current.loaded).toBe(false);
    await act(async () => finish([]));
    expect(result.current.groups).toEqual([]);
    expect(result.current.loaded).toBe(true);
  });

  it('create recorta el nombre, crea y añade el resumen a la lista', async () => {
    mocked.listGroups.mockResolvedValue([]);
    mocked.createGroup.mockResolvedValue(group({ id: 'g2', name: 'Estudio', memberCount: 1, members: [owner] }));
    const { result } = await renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create('  Estudio  ');
    });
    expect(mocked.createGroup).toHaveBeenCalledWith({ name: 'Estudio' });
    expect(result.current.groups).toEqual([
      { id: 'g2', name: 'Estudio', description: '', memberCount: 1, availabilityThreshold: 80 },
    ]);
  });

  it('join añade el grupo; si falla, propaga el ApiError', async () => {
    mocked.listGroups.mockResolvedValue([]);
    mocked.joinGroup
      .mockResolvedValueOnce(group())
      .mockRejectedValueOnce(new ApiError(409, 'ALREADY_MEMBER', 'Ya perteneces a este grupo.'));
    const { result } = await renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.join('PROY2026');
    });
    expect(result.current.groups).toEqual([summary]);

    await act(async () => {
      await expect(result.current.join('PROY2026')).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
    });
    expect(result.current.groups).toEqual([summary]);
  });
});

describe('useGroup', () => {
  it('setEssential actualiza solo a ese miembro', async () => {
    mocked.getGroup.mockResolvedValue(group());
    mocked.setMemberEssential.mockResolvedValue({ ...ana, isEssential: true });
    const { result } = await renderHook(() => useGroup('g1'));
    await waitFor(() => expect(result.current.group).toBeDefined());

    await act(async () => result.current.setEssential('u2', true));
    expect(mocked.setMemberEssential).toHaveBeenCalledWith('g1', 'u2', true);
    expect(result.current.group!.members).toEqual([owner, { ...ana, isEssential: true }]);
  });

  it('leave llama a la API con el id del grupo', async () => {
    mocked.getGroup.mockResolvedValue(group());
    mocked.leaveGroup.mockResolvedValue();
    const { result } = await renderHook(() => useGroup('g1'));
    await act(async () => result.current.leave());
    expect(mocked.leaveGroup).toHaveBeenCalledWith('g1');
  });

  it('un setEssential que termina después de cambiar de grupo no toca el grupo nuevo', async () => {
    mocked.getGroup.mockImplementation(async (id) => group({ id }));
    let finishSetEssential!: (member: GroupMember) => void;
    mocked.setMemberEssential.mockReturnValue(new Promise((resolve) => (finishSetEssential = resolve)));
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useGroup(id), { initialProps: { id: 'g1' } });
    await waitFor(() => expect(result.current.group?.id).toBe('g1'));

    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.setEssential('u2', true);
    });
    await rerender({ id: 'g2' });
    await waitFor(() => expect(result.current.group?.id).toBe('g2'));

    await act(async () => {
      finishSetEssential({ ...ana, isEssential: true });
      await pending;
    });
    expect(mocked.setMemberEssential).toHaveBeenCalledWith('g1', 'u2', true);
    expect(result.current.group!.members).toEqual([owner, ana]);
  });

  it('vuelve a cargar si cambia el id', async () => {
    mocked.getGroup.mockImplementation(async (id) => group({ id }));
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useGroup(id), { initialProps: { id: 'g1' } });
    await waitFor(() => expect(result.current.group?.id).toBe('g1'));
    await rerender({ id: 'g2' });
    await waitFor(() => expect(result.current.group?.id).toBe('g2'));
  });
});

describe('useAvailability', () => {
  it('carga las franjas del grupo', async () => {
    const windows = [{ dayOfWeek: 1, startTime: '12:00', endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 }];
    mocked.getAvailability.mockResolvedValue(windows);
    const { result } = await renderHook(() => useAvailability('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocked.getAvailability).toHaveBeenCalledWith('g1');
    expect(result.current.windows).toEqual(windows);
  });
});
