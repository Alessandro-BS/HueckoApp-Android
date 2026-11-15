import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { makeConfirmed, makeExpressVote } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { ReportIncidenceSheet } from '../ReportIncidenceSheet';

jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const report = async (onReport: jest.Mock, openVoteId: string | null = null) => {
  const onDone = jest.fn();
  await render(<ReportIncidenceSheet openVoteId={openVoteId} onReport={onReport} onDone={onDone} onDismiss={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText('¿Qué pasó?'), '  Me surgió un viaje familiar. ');
  await fireEvent.press(screen.getByText('Reportar'));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(onReport).toHaveBeenCalledWith({ type: 'FALTA', reason: 'Me surgió un viaje familiar.', delayMinutes: null });
};

it('si el reporte abrió una votación, avisa «Se abrió una votación del grupo»', async () => {
  await report(jest.fn().mockResolvedValue(makeConfirmed({ expressVote: makeExpressVote() })));
  expect(showToast).toHaveBeenCalledWith('Se abrió una votación del grupo.');
});

it('si no se abrió votación, avisa «Avisamos al grupo»', async () => {
  await report(jest.fn().mockResolvedValue(makeConfirmed({ expressVote: null })));
  expect(showToast).toHaveBeenCalledWith('Avisamos al grupo.');
});

it('una votación cerrada de antes tampoco cuenta como abierta', async () => {
  await report(jest.fn().mockResolvedValue(makeConfirmed({ expressVote: makeExpressVote({ status: 'CERRADA', result: 'MANTENER', resultByDefault: true }) })));
  expect(showToast).toHaveBeenCalledWith('Avisamos al grupo.');
});

it('con una votación ya abierta, el reporte no abre otra: «Avisamos al grupo»', async () => {
  await report(jest.fn().mockResolvedValue(makeConfirmed({ expressVote: makeExpressVote() })), 'ev_1');
  expect(showToast).toHaveBeenCalledWith('Avisamos al grupo.');
});
