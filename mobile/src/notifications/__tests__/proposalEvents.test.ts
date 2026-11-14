import { emitProposalChanged, subscribeProposalChanged } from '../proposalEvents';

describe('proposalEvents', () => {
  it('avisa solo a quien escucha esa propuesta', () => {
    const a = jest.fn();
    const b = jest.fn();
    const offA = subscribeProposalChanged('p1', a);
    const offB = subscribeProposalChanged('p2', b);
    emitProposalChanged('p1');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    offA();
    offB();
  });

  it('deja de avisar al cancelar la suscripción', () => {
    const a = jest.fn();
    subscribeProposalChanged('p1', a)();
    emitProposalChanged('p1');
    expect(a).not.toHaveBeenCalled();
  });
});
