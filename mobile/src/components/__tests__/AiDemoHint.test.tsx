import type { AiStatus } from '@hueckoapp/shared';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import * as aiApi from '../../api/ai';
import { AI_DEMO_TEXT } from '../../utils/ai';
import { AiDemoHint } from '../AiDemoHint';

jest.mock('../../api/ai');
const mocked = aiApi as jest.Mocked<typeof aiApi>;

it('en modo demostración avisa que las respuestas son de ejemplo', async () => {
  mocked.getAiStatus.mockResolvedValue({ provider: 'mock' });
  await render(<AiDemoHint />);
  expect(await screen.findByText(AI_DEMO_TEXT)).toBeTruthy();
});

it('con Gemini no muestra nada, tampoco cuando la consulta ya terminó', async () => {
  let resolve: (v: AiStatus) => void = () => {};
  mocked.getAiStatus.mockReturnValue(
    new Promise<AiStatus>((r) => {
      resolve = r;
    }),
  );
  await render(<AiDemoHint />);
  await waitFor(() => expect(mocked.getAiStatus).toHaveBeenCalled());
  await act(async () => resolve({ provider: 'gemini' }));
  expect(screen.queryByText(AI_DEMO_TEXT)).toBeNull();
});
