import type { TimeWindowInput } from '@hueckoapp/shared';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';

import { DaySelector, PrimaryButton, SecondaryButton, TextField } from '../../components';
import { colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { dateFor, hasStarted, shortDate } from '../../utils/zone';
import { endTimeHint, isValidRange, startTimeHint } from '../../utils/time';

type Props = {
  /** Lunes «YYYY-MM-DD» de la semana en la que se elige el día. */
  week: string;
  /** Solo para tests: por defecto, el reloj de la app. */
  now?: Date;
  /** La franja debe empezar después de este instante (p. ej. el cierre de la votación). */
  notBefore?: Date;
  submitLabel: string;
  onSubmit: (window: TimeWindowInput) => void;
  /** Franjas que ya están: no se deja repetir una idéntica (el servidor respondería 409). */
  existing?: readonly TimeWindowInput[];
  loading?: boolean;
  variant?: 'primary' | 'secondary';
};

export const DUPLICATE_WINDOW = 'Esa franja ya está en la lista.';
export const OVERLAP_WINDOW = 'Se cruza con otra franja del mismo día.';
export const STARTED_WINDOW = 'Esa franja ya empezó.';
export const BEFORE_DEADLINE_WINDOW = 'Debe empezar después del cierre de la votación.';

// Día + hora de inicio y fin, con la misma validación que «Nuevo bloque» (arregla UI spec §6 quirk 13).
// Valores iniciales de AddWindowBottomSheet (UI spec §2.7): lunes, 09:00–11:00.
export function WindowEditor({ week, now: nowProp, notBefore, submitLabel, onSubmit, existing = [], loading = false, variant = 'primary' }: Props) {
  const now = nowProp ?? today();
  const [chosenDay, setChosenDay] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const endRef = useRef<TextInput>(null);

  // Un día no se puede elegir si ya pasó entero (o si acabó antes de `notBefore`).
  const isDisabled = (d: number) =>
    hasStarted(dateFor(week, d), '23:59', now) || (notBefore !== undefined && hasStarted(dateFor(week, d), '23:59', notBefore));
  const dayOfWeek = isDisabled(chosenDay) ? ([1, 2, 3, 4, 5, 6, 7].find((d) => !isDisabled(d)) ?? chosenDay) : chosenDay;
  const date = dateFor(week, dayOfWeek);

  const startHint = startTimeHint(startTime);
  const endHint = endTimeHint(startTime, endTime);
  const rangeValid = isValidRange(startTime, endTime);
  const duplicate = rangeValid && existing.some((w) => w.date === date && w.startTime === startTime && w.endTime === endTime);
  const overlap =
    rangeValid && !duplicate && existing.some((w) => w.date === date && startTime < w.endTime && w.startTime < endTime);
  const started = rangeValid && hasStarted(date, startTime, now);
  const beforeDeadline = rangeValid && !started && notBefore !== undefined && hasStarted(date, startTime, notBefore);
  const valid = rangeValid && !duplicate && !overlap && !started && !beforeDeadline;

  const submit = () => {
    if (!valid || loading) return;
    onSubmit({ date, startTime, endTime });
  };

  return (
    <View style={styles.editor}>
      <DaySelector
        selected={dayOfWeek}
        onSelect={setChosenDay}
        captionFor={(d) => String(Number(dateFor(week, d).slice(8)))}
        isDisabled={isDisabled}
      />
      <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{shortDate(date)}</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Hora de inicio (HH:mm)"
            value={startTime}
            onChangeText={setStartTime}
            placeholder="09:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            returnKeyType="next"
            onSubmitEditing={() => endRef.current?.focus()}
            error={startHint.error ? startHint.text : undefined}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="Hora de fin (HH:mm)"
            inputRef={endRef}
            value={endTime}
            onChangeText={setEndTime}
            placeholder="11:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            returnKeyType="done"
            onSubmitEditing={submit}
            error={endHint.error ? endHint.text : undefined}
          />
        </View>
      </View>
      {duplicate ? <Text style={[typography.bodySmall, { color: colors.error }]}>{DUPLICATE_WINDOW}</Text> : null}
      {overlap ? <Text style={[typography.bodySmall, { color: colors.error }]}>{OVERLAP_WINDOW}</Text> : null}
      {started ? <Text style={[typography.bodySmall, { color: colors.error }]}>{STARTED_WINDOW}</Text> : null}
      {beforeDeadline ? <Text style={[typography.bodySmall, { color: colors.error }]}>{BEFORE_DEADLINE_WINDOW}</Text> : null}
      {variant === 'primary' ? (
        <PrimaryButton title={submitLabel} onPress={submit} disabled={!valid} loading={loading} />
      ) : (
        <SecondaryButton title={submitLabel} icon="add" onPress={submit} disabled={!valid || loading} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
