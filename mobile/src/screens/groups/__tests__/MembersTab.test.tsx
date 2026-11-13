import type { Group, GroupMember } from '@hueckoapp/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '../../../api/client';
import { showToast } from '../../../utils/toast';
import { MembersTab } from '../tabs/MembersTab';

jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));

const owner: GroupMember = { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com', role: 'ORGANIZER', isEssential: false };
const ana: GroupMember = { id: 'u2', name: 'Ana', email: 'ana@test.com', role: 'MEMBER', isEssential: true };
const group: Group = {
  id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 2, availabilityThreshold: 80,
  inviteCode: 'PROY2026', members: [owner, ana],
};

it('lista a todos con sus insignias; un MEMBER no ve los interruptores', async () => {
  await render(<MembersTab group={group} currentUserId="u2" onToggleEssential={jest.fn()} onSetRole={jest.fn()} onLeave={jest.fn()} />);
  expect(screen.getByText('Usuario de Prueba')).toBeTruthy();
  expect(screen.getByText('Ana (tú)')).toBeTruthy();
  expect(screen.getByText('Organizador')).toBeTruthy();
  expect(screen.getByText('Imprescindible')).toBeTruthy();
  expect(screen.queryByLabelText('Imprescindible: Ana')).toBeNull();
});

it('con más de 8 miembros se ven todos (resuelve el TODO «Ver todos los integrantes»)', async () => {
  const members: GroupMember[] = Array.from({ length: 10 }, (_, i) => ({
    id: `u${i}`, name: `Persona ${i}`, email: `p${i}@test.com`, role: i === 0 ? 'ORGANIZER' : 'MEMBER', isEssential: false,
  }));
  await render(
    <MembersTab group={{ ...group, members, memberCount: 10 }} currentUserId="u0" onToggleEssential={jest.fn()} onSetRole={jest.fn()} onLeave={jest.fn()} />,
  );
  expect(screen.getByText('Persona 9')).toBeTruthy();
});

it('el ORGANIZER marca y desmarca imprescindibles', async () => {
  const onToggle = jest.fn().mockResolvedValue(undefined);
  await render(<MembersTab group={group} currentUserId="u1" onToggleEssential={onToggle} onSetRole={jest.fn()} onLeave={jest.fn()} />);
  await fireEvent(screen.getByLabelText('Imprescindible: Ana'), 'valueChange', false);
  expect(onToggle).toHaveBeenCalledWith('u2', false);
});

it('salir del grupo pide confirmación y solo sale al confirmar', async () => {
  const onLeave = jest.fn().mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<MembersTab group={group} currentUserId="u2" onToggleEssential={jest.fn()} onSetRole={jest.fn()} onLeave={onLeave} />);

  await fireEvent.press(screen.getByText('Salir del grupo'));
  expect(alert).toHaveBeenCalledWith(
    'Salir del grupo',
    '¿Seguro que quieres salir de «Proyecto Integrador»? Tu horario dejará de contar en sus huecos.',
    expect.any(Array),
  );
  // Solo se abrió la confirmación: nada ha salido todavía.
  expect(onLeave).not.toHaveBeenCalled();

  const buttons = alert.mock.calls[0][2]!;
  // «Cancelar» no tiene acción; el control positivo es «Salir».
  expect(buttons.find((b) => b.text === 'Cancelar')!.onPress).toBeUndefined();
  await act(async () => buttons.find((b) => b.text === 'Salir')!.onPress!());
  expect(onLeave).toHaveBeenCalledTimes(1);
});

const bea: GroupMember = { id: 'u3', name: 'Bea', email: 'bea@test.com', role: 'ORGANIZER', isEssential: false };
const trio: Group = { ...group, memberCount: 3, members: [owner, ana, bea] };
const renderTab = (g: Group, me: string, onSetRole = jest.fn().mockResolvedValue(undefined)) =>
  render(<MembersTab group={g} currentUserId={me} onToggleEssential={jest.fn()} onSetRole={onSetRole} onLeave={jest.fn()} />);

describe('organizadores', () => {
  beforeEach(() => jest.clearAllMocks());

  it('todos ven la insignia en cada organizador', async () => {
    await renderTab(trio, 'u2');
    expect(screen.getAllByText('Organizador')).toHaveLength(2);
  });

  it('un MEMBER no ve «Hacer organizador» ni «Quitar organizador»', async () => {
    await renderTab(trio, 'u2');
    expect(screen.queryByText('Hacer organizador')).toBeNull();
    expect(screen.queryByLabelText(/^Quitar organizador/)).toBeNull();
    expect(screen.queryByLabelText(/^Imprescindible:/)).toBeNull();
  });

  it('el texto de ayuda menciona imprescindibles y organizadores', async () => {
    await renderTab(trio, 'u1');
    expect(screen.getByText(/imprescindibles/)).toBeTruthy();
    expect(screen.getByText(/organizadores/)).toBeTruthy();
  });

  it('«Hacer organizador» llama onSetRole sin confirmar y avisa', async () => {
    const onSetRole = jest.fn().mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderTab(trio, 'u1', onSetRole);
    await fireEvent.press(screen.getByText('Hacer organizador'));
    expect(alert).not.toHaveBeenCalled();
    expect(onSetRole).toHaveBeenCalledWith('u2', 'ORGANIZER');
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Ana ahora es organizador del grupo.'));
  });

  it('«Quitar organizador» a otro pide confirmación y al aceptar llama onSetRole', async () => {
    const onSetRole = jest.fn().mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderTab(trio, 'u1', onSetRole);
    await fireEvent.press(screen.getByLabelText('Quitar organizador: Bea'));
    expect(alert).toHaveBeenCalledWith('Quitar organizador', 'Bea dejará de organizar el grupo.', expect.any(Array));
    expect(onSetRole).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls[0][2]!.find((b) => b.text === 'Quitar')!.onPress!());
    expect(onSetRole).toHaveBeenCalledWith('u3', 'MEMBER');
  });

  it('quitarme a mí mismo avisa con el nombre del grupo', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderTab(trio, 'u1');
    await fireEvent.press(screen.getByLabelText('Quitar organizador: Usuario de Prueba'));
    expect(alert).toHaveBeenCalledWith(
      'Quitar organizador',
      'Dejarás de organizar «Proyecto Integrador»: ya no podrás editarlo ni gestionar sus planes.',
      expect.any(Array),
    );
  });

  it('si el servidor responde LAST_ORGANIZER, muestra su mensaje', async () => {
    const onSetRole = jest.fn().mockRejectedValue(new ApiError(409, 'LAST_ORGANIZER', 'El grupo necesita al menos un organizador.'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderTab(group, 'u1', onSetRole);
    await fireEvent.press(screen.getByLabelText('Quitar organizador: Usuario de Prueba'));
    await act(async () => alert.mock.calls[0][2]!.find((b) => b.text === 'Quitar')!.onPress!());
    expect(showToast).toHaveBeenCalledWith('El grupo necesita al menos un organizador.');
  });
});
