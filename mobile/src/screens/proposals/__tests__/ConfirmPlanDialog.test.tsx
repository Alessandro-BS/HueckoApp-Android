import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import { makeWindow } from '../../../testing/fixtures';
import { ConfirmPlanDialog } from '../ConfirmPlanDialog';

const NO_WINDOWS_TEXT = 'Esta propuesta no tiene franjas. Agrega una desde «Votar» antes de confirmar.';
const props = { onConfirm: jest.fn(), onDone: jest.fn(), onDismiss: jest.fn() };

it('sin franjas explica qué hacer en lugar de mostrar una lista vacía', async () => {
  await render(<ConfirmPlanDialog {...props} windows={[]} />);
  expect(screen.getByText(NO_WINDOWS_TEXT)).toBeTruthy();
  expect(screen.queryByText('Elige la franja del plan. Con «La más votada» gana la que tenga más votos.')).toBeNull();
  expect(screen.getByLabelText('Confirmar').props.accessibilityState.disabled).toBe(true);
});

it('con franjas las lista y no muestra el aviso', async () => {
  await render(<ConfirmPlanDialog {...props} windows={[makeWindow()]} />);
  expect(screen.getByText('Mar 29 sep · 16:00 - 18:00 · 0 votos')).toBeTruthy();
  expect(screen.queryByText(NO_WINDOWS_TEXT)).toBeNull();
});

it('confirmar una franja que ya empezó muestra «Esa franja ya empezó: replantea la propuesta.» y ofrece Replantear', async () => {
  const onConfirm = jest.fn().mockRejectedValue(new ApiError(409, 'WINDOW_STARTED', 'Esa franja ya empezó: replantea la propuesta.'));
  const onReplan = jest.fn();
  await render(<ConfirmPlanDialog {...props} onConfirm={onConfirm} onReplan={onReplan} windows={[makeWindow({ voteCount: 1 })]} />);
  expect(screen.queryByText('Replantear')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Confirmar'));
  expect(await screen.findByText('Esa franja ya empezó: replantea la propuesta.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Replantear'));
  expect(onReplan).toHaveBeenCalled();
});

it('otro error no ofrece Replantear', async () => {
  const onConfirm = jest.fn().mockRejectedValue(new ApiError(409, 'NO_VOTES', 'Sin votos.'));
  await render(<ConfirmPlanDialog {...props} onConfirm={onConfirm} onReplan={jest.fn()} windows={[makeWindow({ voteCount: 1 })]} />);
  await fireEvent.press(screen.getByLabelText('Confirmar'));
  expect(await screen.findByText('Sin votos.')).toBeTruthy();
  expect(screen.queryByText('Replantear')).toBeNull();
});
