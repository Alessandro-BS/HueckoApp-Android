import { useAction } from './useAction';

export type VoteOutcome = 'voted' | 'unvoted';

type VoteToggleOptions = {
  /** Franjas que el usuario tiene votadas hoy en esa propuesta (vacío si ninguna). */
  votesOf: (proposalId: string) => readonly string[];
  /** true: se pueden votar varias franjas; false: un voto por persona (votar otra lo mueve). */
  isMultiple: (proposalId: string) => boolean;
  vote: (proposalId: string, windowId: string) => Promise<unknown>;
  unvote: (proposalId: string, windowId?: string) => Promise<unknown>;
};

// G1: tocar una franja que ya voté retira el voto; cualquier otra lo pone (con voto único, lo mueve; con voto
// múltiple, se suma). Es la ÚNICA implementación de esa alternancia (Votar e Inicio la comparten). Con voto
// múltiple solo se retira la franja tocada (unvote(id, windowId)); con voto único, el voto (unvote(id)). Envuelve
// useAction: evita el doble toque y expone el error; nunca lanza. `value` dice qué pasó para que la pantalla avise
// («Tu voto ha sido registrado.» / «Tu voto se ha retirado.»).
export function useVoteToggle({ votesOf, isMultiple, vote, unvote }: VoteToggleOptions) {
  const { run, loading, error, clearError } = useAction(
    async (proposalId: string, windowId: string): Promise<VoteOutcome> => {
      if (votesOf(proposalId).includes(windowId)) {
        if (isMultiple(proposalId)) await unvote(proposalId, windowId);
        else await unvote(proposalId);
        return 'unvoted';
      }
      await vote(proposalId, windowId);
      return 'voted';
    },
  );
  return { toggle: run, loading, error, clearError };
}
