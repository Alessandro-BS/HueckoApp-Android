import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { showToast } from '../../../utils/toast';
import { InviteCodeCard } from '../InviteCodeCard';

jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));

it('muestra el código, lo copia y avisa (resuelve UI spec §6 punto 3)', async () => {
  await render(<InviteCodeCard code="PROY2026" />);
  expect(screen.getByText('PROY2026')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Copiar código de invitación'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Código PROY2026 copiado.'));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('PROY2026');
});
