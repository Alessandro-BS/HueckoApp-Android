import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../theme';
import { today } from '../utils/clock';
import { formatDateLabel, formatDateTime, toDateKey } from '../utils/days';

type Props = {
  label: string;
  value: Date | null;
  onChange: (value: Date) => void;
  /** 'datetime' pide la fecha y después la hora (en Android son dos diálogos nativos seguidos). */
  mode?: 'date' | 'datetime';
  minimumDate?: Date;
  placeholder?: string;
  error?: string;
  helperText?: string;
};

type Step = 'date' | 'time' | null;

// Campo que abre el selector nativo de fecha/hora (@react-native-community/datetimepicker).
// Sustituye al texto libre de Kotlin para el plazo de votación (UI spec §6 quirk 14) y a los chips de fecha de «Nuevo bloque».
export function DateTimeField({ label, value, onChange, mode = 'datetime', minimumDate, placeholder = 'Elegir', error, helperText }: Props) {
  const [step, setStep] = useState<Step>(null);
  const [pickedDay, setPickedDay] = useState<Date | null>(null);
  const initial = value ?? minimumDate ?? today();
  // Lo que cambia en cada render del padre (onChange en línea, fecha inicial) va en una ref: así handleChange
  // solo cambia con el paso o el día elegido y el selector de Android no se reabre por un re-render ajeno.
  const latest = useRef({ onChange, initial });
  latest.current = { onChange, initial };

  const handleChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
    const close = () => {
      setStep(null);
      setPickedDay(null);
    };
    if (event.type !== 'set' || !selected) {
      close();
      return;
    }
    if (step === 'date') {
      const day = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
      if (mode === 'date') {
        close();
        latest.current.onChange(day);
        return;
      }
      setPickedDay(day);
      setStep('time');
      return;
    }
    const day = pickedDay ?? latest.current.initial;
    close();
    latest.current.onChange(new Date(day.getFullYear(), day.getMonth(), day.getDate(), selected.getHours(), selected.getMinutes()));
    },
    [step, pickedDay, mode],
  );

  const text = value ? (mode === 'date' ? formatDateLabel(toDateKey(value)) : formatDateTime(value)) : placeholder;

  return (
    <View>
      <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <View style={{ height: 6 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setStep('date')}
        style={[styles.field, { borderColor: error ? colors.error : colors.outlineVariant, borderWidth: error ? 2 : 1 }]}
      >
        <MaterialIcons name={mode === 'date' ? 'event' : 'schedule'} size={20} color={colors.onSurfaceVariant} />
        <Text style={[typography.bodyLarge, styles.value, { color: value ? colors.onSurface : colors.outline }]}>{text}</Text>
      </Pressable>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[typography.bodySmall, styles.hint, { color: colors.error }]}>
          {error}
        </Text>
      ) : helperText ? (
        <Text style={[typography.bodySmall, styles.hint, { color: colors.onSurfaceVariant }]}>{helperText}</Text>
      ) : null}
      {step ? (
        <DateTimePicker
          value={initial}
          mode={step}
          is24Hour
          display="default"
          minimumDate={step === 'date' ? minimumDate : undefined}
          onChange={handleChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: radius.xxl, paddingHorizontal: 12 },
  value: { flex: 1 },
  hint: { marginTop: 4 },
});
