import { useAction } from './useAction';

export type VoteOutcome = 'voted' | 'unvoted';

type VoteToggleOptions = {
  /** Franja que el usuario tiene votada hoy en esa propuesta (null si ninguna). */
  currentVote: (proposalId: string) => string | null | undefined;
  vote: (proposalId: string, windowId: string) => Promise<unknown>;
  unvote: (proposalId: string) => Promise<unknown>;
};

// G1: tocar la franja que ya voté retira el voto; cualquier otra lo pone o lo mueve. Es la ÚNICA
// implementación de esa alternancia (Votar e Inicio la comparten). Envuelve useAction: evita el doble
// toque y expone el error; nunca lanza. `value` dice qué pasó para que la pantalla avise
// («Tu voto ha sido registrado.» / «Tu voto se ha retirado.»).
export function useVoteToggle({ currentVote, vote, unvote }: VoteToggleOptions) {
  const { run, loading, error, clearError } = useAction(
    async (proposalId: string, windowId: string): Promise<VoteOutcome> => {
      if (currentVote(proposalId) === windowId) {
        await unvote(proposalId);
        return 'unvoted';
      }
      await vote(proposalId, windowId);
      return 'voted';
    },
  );
  return { toggle: run, loading, error, clearError };
}
