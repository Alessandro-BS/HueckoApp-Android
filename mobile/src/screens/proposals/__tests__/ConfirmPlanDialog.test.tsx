import { render, screen } from '@testing-library/react-native';

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
  expect(screen.getByText('Mar · 16:00 - 18:00 · 0 votos')).toBeTruthy();
  expect(screen.queryByText(NO_WINDOWS_TEXT)).toBeNull();
});
