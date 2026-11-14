// Aviso interno de «esta propuesta cambió en el servidor» (llega un push con la pantalla abierta).
// Las pantallas que muestran la propuesta (useProposal) se suscriben y se recargan.
type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeProposalChanged(proposalId: string, callback: Listener): () => void {
  let set = listeners.get(proposalId);
  if (!set) listeners.set(proposalId, (set = new Set()));
  set.add(callback);
  return () => {
    set.delete(callback);
    if (set.size === 0 && listeners.get(proposalId) === set) listeners.delete(proposalId);
  };
}

export function emitProposalChanged(proposalId: string): void {
  listeners.get(proposalId)?.forEach((callback) => callback());
}
