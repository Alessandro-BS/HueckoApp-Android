import { MaterialIcons } from '@expo/vector-icons';
import type { TimeWindowInput } from '@hueckoapp/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, DateTimeField, ErrorBanner, PrimaryButton, WeekSelector } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { deadlineAfterFirstWindow, DEADLINE_AFTER_WINDOW, MAX_WINDOWS, MIN_WINDOWS } from '../../utils/planWindows';
import { windowLabel } from '../../utils/proposals';
import { weekOptions } from '../../utils/zone';
import { WindowEditor } from './WindowEditor';

type Props = {
  title: string;
  submitLabel: string;
  onSubmit: (input: { votingDeadline: string; windows: TimeWindowInput[] }) => Promise<unknown>;
  onDismiss: () => void;
  /** Solo para tests: por defecto, el reloj de la app. */
  now?: Date;
};

// Plazo nuevo + 2 a 5 franjas con fecha. Lo usan «Reprogramar» (votación exprés) y «Replantear»: en los dos
// el servidor borra los votos y reabre la votación. Los errores del servidor se muestran dentro de la hoja.
export function ReplanSheet({ title, submitLabel, onSubmit, onDismiss, now: nowProp }: Props) {
  const [clock] = useState(today);
  const now = nowProp ?? clock;
  const [week, setWeek] = useState(() => weekOptions(now)[0].week);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [windows, setWindows] = useState<TimeWindowInput[]>([]);
  const action = useAction(onSubmit);

  const deadlineError = deadline && deadline.getTime() <= now.getTime() ? 'La fecha límite debe ser futura' : undefined;
  const afterWindow = deadlineAfterFirstWindow(deadline, windows);
  const countOk = windows.length >= MIN_WINDOWS && windows.length <= MAX_WINDOWS;
  const valid = deadline !== null && !deadlineError && !afterWindow && countOk;

  const submit = async () => {
    if (!valid || !deadline) return;
    await action.run({ votingDeadline: deadline.toISOString(), windows });
  };

  return (
    <BottomSheet
      title={title}
      subtitle="Se borrarán los votos y el grupo volverá a votar las franjas hasta la nueva fecha límite."
      onDismiss={onDismiss}
      dismissable={!action.loading}
    >
      <DateTimeField
        label="Nueva fecha límite de votación"
        value={deadline}
        onChange={setDeadline}
        minimumDate={now}
        placeholder="Elige fecha y hora"
        error={deadlineError ?? (afterWindow ? DEADLINE_AFTER_WINDOW : undefined)}
      />
      <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>Semana</Text>
      <WeekSelector value={week} onChange={setWeek} now={now} />
      {windows.map((w) => (
        <View key={`${w.date}-${w.startTime}-${w.endTime}`} style={styles.windowRow}>
          <Text style={[typography.titleSmall, styles.flex, { color: colors.onSurface }]}>{windowLabel(w)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${windowLabel(w)}`}
            onPress={() => setWindows((prev) => prev.filter((x) => x !== w))}
            style={styles.iconButton}
          >
            <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
      ))}
      {windows.length < MAX_WINDOWS ? (
        <WindowEditor
          variant="secondary"
          week={week}
          now={now}
          notBefore={deadline && !deadlineError ? deadline : undefined}
          submitLabel="Añadir franja"
          existing={windows}
          onSubmit={(w) => setWindows((prev) => [...prev, w])}
        />
      ) : (
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>Ya tienes {MAX_WINDOWS} franjas: quita una para añadir otra.</Text>
      )}
      {!countOk ? (
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
          Elige entre {MIN_WINDOWS} y {MAX_WINDOWS} franjas
        </Text>
      ) : null}
      {action.error ? <ErrorBanner message={action.error} /> : null}
      <PrimaryButton title={submitLabel} accessibilityLabel={submitLabel} loading={action.loading} disabled={!valid} onPress={() => void submit()} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  windowRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderRadius: 12, backgroundColor: colors.surfaceContainer },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
