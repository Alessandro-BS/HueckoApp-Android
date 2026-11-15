import type { TimeWindowInput } from '@hueckoapp/shared';

import { useState } from 'react';

import { BottomSheet, ErrorBanner, WeekSelector } from '../../components';
import { useAction } from '../../hooks/useAction';
import { today } from '../../utils/clock';
import { weekOptions } from '../../utils/zone';
import { WindowEditor } from './WindowEditor';

type Props = {
  /** Cierre de la votación vigente (ISO): la franja nueva debe empezar después. */
  votingDeadline: string;
  /** Solo para tests: por defecto, el reloj de la app. */
  now?: Date;
  existing: readonly TimeWindowInput[];
  onAdd: (window: TimeWindowInput) => Promise<unknown>;
  onDone: () => void;
  onDismiss: () => void;
};

// AddWindowBottomSheet (UI spec §2.7) con validación de formato y orden (quirk 13). El % lo calcula el servidor (G2).
export function AddWindowSheet({ votingDeadline, now: nowProp, existing, onAdd, onDone, onDismiss }: Props) {
  const now = nowProp ?? today();
  const deadline = new Date(votingDeadline);
  // Se abre en la semana del cierre (las franjas nuevas van después); si no es una semana válida, en la primera.
  const weeks = weekOptions(now).map((o) => o.week);
  const deadlineWeek = Number.isNaN(deadline.getTime()) ? null : weekOptions(deadline)[0].week;
  const [week, setWeek] = useState(deadlineWeek && weeks.includes(deadlineWeek) ? deadlineWeek : weeks[0]);
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
      <WeekSelector value={week} onChange={setWeek} now={now} />
      <WindowEditor week={week} now={now} notBefore={Number.isNaN(deadline.getTime()) ? undefined : deadline} submitLabel="Agregar" existing={existing} loading={action.loading} onSubmit={(w) => void submit(w)} />
      {action.error ? <ErrorBanner message={action.error} /> : null}
    </BottomSheet>
  );
}
