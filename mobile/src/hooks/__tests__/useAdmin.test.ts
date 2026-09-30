import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/admin';
import type { DateRange } from '../../api/admin';
import { ApiError } from '../../api/client';
import {
  makeAdminProposal, makeAuditEntry, makeGroupDetail, makePopularHours, makeReport, makeStats, makeTimeseries, makeUserDetail,
  makeUserSummary, page,
} from '../../testing/adminFixtures';
import { useAdminGroup } from '../useAdminGroup';
import { useAdminAudit, useAdminUsers } from '../useAdminLists';
import { useAdminReport } from '../useAdminReport';
import { useAdminStats } from '../useAdminStats';
import { useAdminUser } from '../useAdminUser';

jest.mock('../../api/admin');
jest.mock('../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
const admin = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => jest.clearAllMocks());

describe('usePagedList (useAdminUsers / useAdminAudit)', () => {
  it('página 1 sin búsqueda; buscar vuelve a la 1 y pasar de página conserva la búsqueda', async () => {
    admin.listAdminUsers.mockResolvedValue(page([makeUserSummary()], { total: 45 }));
    const { result } = await renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(admin.listAdminUsers).toHaveBeenLastCalledWith('', 1);
    expect(result.current).toMatchObject({ page: 1, pageCount: 3, hasPrev: false, hasNext: true, total: 45 });

    await act(async () => result.current.nextPage());
    await waitFor(() => expect(admin.listAdminUsers).toHaveBeenLastCalledWith('', 2));
    await act(async () => result.current.applySearch('  ana '));
    await waitFor(() => expect(admin.listAdminUsers).toHaveBeenLastCalledWith('ana', 1));
    expect(result.current.search).toBe('ana');
    await act(async () => result.current.nextPage());
    await waitFor(() => expect(admin.listAdminUsers).toHaveBeenLastCalledWith('ana', 2));
    expect(result.current.hasPrev).toBe(true);
  });

  it('el registro pide solo la página', async () => {
    admin.listAudit.mockResolvedValue(page([makeAuditEntry()]));
    const { result } = await renderHook(() => useAdminAudit());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(admin.listAudit).toHaveBeenCalledWith(1);
  });
});

describe('useAdminStats', () => {
  it('totales, las últimas 12 semanas y las horas, en una sola carga', async () => {
    admin.getAdminStats.mockResolvedValue(makeStats());
    admin.getTimeseries.mockResolvedValue(makeTimeseries());
    admin.getPopularHours.mockResolvedValue(makePopularHours());
    const { result } = await renderHook(() => useAdminStats());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(admin.getTimeseries).toHaveBeenCalledWith({ from: '2026-07-13', to: '2026-09-29' }, 'week');
    expect(admin.getPopularHours).toHaveBeenCalledWith();
    expect(result.current.stats).toEqual(makeStats());
    expect(result.current.weekly).toEqual(makeTimeseries());
  });

  it('si falla una de las tres, queda el error y no hay datos', async () => {
    admin.getAdminStats.mockResolvedValue(makeStats());
    admin.getTimeseries.mockRejectedValue(new ApiError(403, 'NOT_ADMIN', 'Solo la administración de HueckoApp puede hacer esto.'));
    admin.getPopularHours.mockResolvedValue(makePopularHours());
    const { result } = await renderHook(() => useAdminStats());
    await waitFor(() => expect(result.current.error).toBe('Solo la administración de HueckoApp puede hacer esto.'));
    expect(result.current.stats).toBeUndefined();
  });
});

describe('useAdminReport', () => {
  it('pide el informe del periodo y solo recarga si cambian los días', async () => {
    admin.getReport.mockResolvedValue(makeReport());
    const initialProps: { range: DateRange } = { range: { from: '2026-08-31', to: '2026-09-29' } };
    const { result, rerender } = await renderHook(({ range }: { range: DateRange }) => useAdminReport(range), { initialProps });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await rerender({ range: { from: '2026-08-31', to: '2026-09-29' } }); // mismo periodo, objeto nuevo
    expect(admin.getReport).toHaveBeenCalledTimes(1);
    await rerender({ range: { from: '2026-09-23', to: '2026-09-29' } });
    await waitFor(() => expect(admin.getReport).toHaveBeenCalledTimes(2));
    expect(admin.getReport).toHaveBeenLastCalledWith({ from: '2026-09-23', to: '2026-09-29' });
  });
});

describe('useAdminUser', () => {
  it('suspender actualiza el detalle; un 409 queda en actionError y el detalle no cambia', async () => {
    admin.getAdminUser.mockResolvedValue(makeUserDetail());
    admin.setUserStatus.mockResolvedValueOnce(makeUserDetail({ status: 'SUSPENDED' }));
    const { result } = await renderHook(() => useAdminUser('u2'));
    await waitFor(() => expect(result.current.user).toBeDefined());
    await act(async () => {
      await result.current.setStatus('SUSPENDED');
    });
    expect(admin.setUserStatus).toHaveBeenCalledWith('u2', 'SUSPENDED');
    expect(result.current.user?.status).toBe('SUSPENDED');

    admin.setUserRole.mockRejectedValueOnce(new ApiError(409, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo.'));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.setRole('ADMIN');
    });
    expect(outcome).toEqual({ ok: false });
    expect(result.current.actionError).toBe('Tiene que quedar al menos un administrador activo.');
    expect(result.current.user?.role).toBe('USER');
  });
});

describe('useAdminUser: actionError es siempre el de la acción más reciente', () => {
  it('dos acciones distintas que fallan seguidas muestran el mensaje de la segunda; un éxito posterior lo borra', async () => {
    admin.getAdminUser.mockResolvedValue(makeUserDetail());
    admin.setUserRole.mockRejectedValue(new ApiError(409, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo.'));
    admin.setUserStatus.mockRejectedValueOnce(new ApiError(409, 'CANNOT_CHANGE_SELF', 'No puedes cambiar tu propia cuenta.'));
    const { result } = await renderHook(() => useAdminUser('u2'));
    await waitFor(() => expect(result.current.user).toBeDefined());

    await act(async () => {
      await result.current.setRole('ADMIN');
    });
    expect(result.current.actionError).toBe('Tiene que quedar al menos un administrador activo.');
    await act(async () => {
      await result.current.setStatus('SUSPENDED');
    });
    expect(result.current.actionError).toBe('No puedes cambiar tu propia cuenta.'); // no el del rol, que sigue guardado

    // Y al revés: ahora falla primero el estado y después el rol.
    admin.setUserStatus.mockRejectedValueOnce(new ApiError(409, 'CANNOT_CHANGE_SELF', 'No puedes cambiar tu propia cuenta.'));
    await act(async () => {
      await result.current.setStatus('SUSPENDED');
    });
    await act(async () => {
      await result.current.setRole('ADMIN');
    });
    expect(result.current.actionError).toBe('Tiene que quedar al menos un administrador activo.');

    // Una acción que sale bien después limpia el mensaje, aunque la otra acción tuviera uno guardado.
    admin.setUserStatus.mockResolvedValueOnce(makeUserDetail({ status: 'SUSPENDED' }));
    await act(async () => {
      await result.current.setStatus('SUSPENDED');
    });
    expect(result.current.actionError).toBeNull();
  });
});

describe('useAdminGroup', () => {
  it('cancelar una propuesta la actualiza en el detalle; borrar llama al endpoint', async () => {
    admin.getAdminGroup.mockResolvedValue(makeGroupDetail());
    admin.cancelProposalAsAdmin.mockResolvedValue(makeAdminProposal({ state: 'CANCELADO' }));
    admin.deleteAdminGroup.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useAdminGroup('g1'));
    await waitFor(() => expect(result.current.group).toBeDefined());
    await act(async () => {
      await result.current.cancelProposal('prop_2', 'Spam');
    });
    expect(admin.cancelProposalAsAdmin).toHaveBeenCalledWith('prop_2', 'Spam');
    expect(result.current.group?.proposals[0].state).toBe('CANCELADO');
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.remove();
    });
    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(admin.deleteAdminGroup).toHaveBeenCalledWith('g1');
  });
});
