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

// Día + hora de inicio y fin, con la misma validación que «Nuevo bloque» (arregla UI spec §6 quirk 13).
// Valores iniciales de AddWindowBottomSheet (UI spec §2.7): lunes, 09:00–11:00.
export function WindowEditor({ submitLabel, onSubmit, existing = [], loading = false, variant = 'primary' }: Props) {
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const endRef = useRef<TextInput>(null);

  const startHint = startTimeHint(startTime);
  const endHint = endTimeHint(startTime, endTime);
  const duplicate = existing.some((w) => w.dayOfWeek === dayOfWeek && w.startTime === startTime && w.endTime === endTime);
  const valid = isValidRange(startTime, endTime) && !duplicate;

  const submit = () => {
    if (!valid || loading) return;
    onSubmit({ dayOfWeek, startTime, endTime });
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
