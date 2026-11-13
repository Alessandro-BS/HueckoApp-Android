import type { TimeWindowInput } from '@hueckoapp/shared';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';

import { DaySelector, PrimaryButton, SecondaryButton, TextField } from '../../components';
import { colors, typography } from '../../theme';
import { endTimeHint, isValidRange, startTimeHint } from '../../utils/time';

type Props = {
  submitLabel: string;
  onSubmit: (window: TimeWindowInput) => void;
  /** Franjas que ya están: no se deja repetir una idéntica (el servidor respondería 409). */
  existing?: readonly TimeWindowInput[];
  loading?: boolean;
  variant?: 'primary' | 'secondary';
};

export const DUPLICATE_WINDOW = 'Esa franja ya está en la lista.';

// TODO(franjas-con-fecha Task 8): el editor aún elige solo el día de la semana; la franja se envía con la fecha de la
// próxima vez que ocurre ese día en Lima (hoy si la hora de inicio aún no llegó). El selector de semana la reemplaza.
const limaNow = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
};

export function nextDateOf(dayOfWeek: number, startTime: string, now: Date = new Date()): string {
  const { date, time } = limaNow(now);
  const today = new Date(`${date}T00:00:00Z`);
  const isoToday = ((today.getUTCDay() + 6) % 7) + 1;
  let offset = (dayOfWeek - isoToday + 7) % 7;
  if (offset === 0 && startTime <= time) offset = 7;
  return new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}

// Día + hora de inicio y fin, con la misma validación que «Nuevo bloque» (arregla UI spec §6 quirk 13).
// Valores iniciales de AddWindowBottomSheet (UI spec §2.7): lunes, 09:00–11:00.
export function WindowEditor({ submitLabel, onSubmit, existing = [], loading = false, variant = 'primary' }: Props) {
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const endRef = useRef<TextInput>(null);

  const startHint = startTimeHint(startTime);
  const endHint = endTimeHint(startTime, endTime);
  const rangeValid = isValidRange(startTime, endTime);
  const date = rangeValid ? nextDateOf(dayOfWeek, startTime) : null;
  const duplicate = existing.some((w) => w.date === date && w.startTime === startTime && w.endTime === endTime);
  const valid = rangeValid && !duplicate;

  const submit = () => {
    if (!valid || loading || !date) return;
    onSubmit({ date, startTime, endTime });
  };

  return (
    <View style={styles.editor}>
      <DaySelector selected={dayOfWeek} onSelect={setDayOfWeek} captionFor={() => ''} />
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
