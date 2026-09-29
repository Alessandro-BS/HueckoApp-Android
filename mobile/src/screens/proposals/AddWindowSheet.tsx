import type { TimeWindowInput } from '@hueckoapp/shared';

import { BottomSheet, ErrorBanner } from '../../components';
import { useAction } from '../../hooks/useAction';
import { WindowEditor } from './WindowEditor';

type Props = {
  existing: readonly TimeWindowInput[];
  onAdd: (window: TimeWindowInput) => Promise<unknown>;
  onDone: () => void;
  onDismiss: () => void;
};

// AddWindowBottomSheet (UI spec §2.7) con validación de formato y orden (quirk 13). El % lo calcula el servidor (G2).
export function AddWindowSheet({ existing, onAdd, onDone, onDismiss }: Props) {
  const action = useAction(onAdd);
  const submit = async (window: TimeWindowInput) => {
    const result = await action.run(window);
    if (result.ok) onDone();
  };
  return (
    <BottomSheet
      title="Agregar franja horaria"
      subtitle="Selecciona el día y la franja horaria que propones."
      onDismiss={onDismiss}
      dismissable={!action.loading}
    >
      <WindowEditor submitLabel="Agregar" existing={existing} loading={action.loading} onSubmit={(w) => void submit(w)} />
      {action.error ? <ErrorBanner message={action.error} /> : null}
    </BottomSheet>
  );
}
