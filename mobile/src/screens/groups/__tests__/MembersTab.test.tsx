import type { Group, GroupMember } from '@hueckoapp/shared';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { MembersTab } from '../tabs/MembersTab';

jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));

const owner: GroupMember = { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com', role: 'OWNER', isEssential: false };
const ana: GroupMember = { id: 'u2', name: 'Ana', email: 'ana@test.com', role: 'MEMBER', isEssential: true };
const group: Group = {
  id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 2, availabilityThreshold: 80,
  inviteCode: 'PROY2026', members: [owner, ana],
};

it('lista a todos con sus insignias; un MEMBER no ve los interruptores', async () => {
  await render(<MembersTab group={group} currentUserId="u2" onToggleEssential={jest.fn()} onLeave={jest.fn()} />);
  expect(screen.getByText('Usuario de Prueba')).toBeTruthy();
  expect(screen.getByText('Ana (tú)')).toBeTruthy();
  expect(screen.getByText('Administrador')).toBeTruthy();
  expect(screen.getByText('Imprescindible')).toBeTruthy();
  expect(screen.queryByLabelText('Imprescindible: Ana')).toBeNull();
});

it('con más de 8 miembros se ven todos (resuelve el TODO «Ver todos los integrantes»)', async () => {
  const members: GroupMember[] = Array.from({ length: 10 }, (_, i) => ({
    id: `u${i}`, name: `Persona ${i}`, email: `p${i}@test.com`, role: i === 0 ? 'OWNER' : 'MEMBER', isEssential: false,
  }));
  await render(
    <MembersTab group={{ ...group, members, memberCount: 10 }} currentUserId="u0" onToggleEssential={jest.fn()} onLeave={jest.fn()} />,
  );
  expect(screen.getByText('Persona 9')).toBeTruthy();
});

it('el OWNER marca y desmarca imprescindibles', async () => {
  const onToggle = jest.fn().mockResolvedValue(undefined);
  await render(<MembersTab group={group} currentUserId="u1" onToggleEssential={onToggle} onLeave={jest.fn()} />);
  await fireEvent(screen.getByLabelText('Imprescindible: Ana'), 'valueChange', false);
  expect(onToggle).toHaveBeenCalledWith('u2', false);
});

it('salir del grupo pide confirmación y solo sale al confirmar', async () => {
  const onLeave = jest.fn().mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<MembersTab group={group} currentUserId="u2" onToggleEssential={jest.fn()} onLeave={onLeave} />);

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
