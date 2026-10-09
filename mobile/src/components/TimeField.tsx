import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../theme';
import { today } from '../utils/clock';
import { isValidTime } from '../utils/time';

type Props = {
  /** Etiqueta visible sobre el campo (opcional: «Nuevo bloque» usa el texto de ayuda «Inicio»/«Fin»). */
  label?: string;
  /** Nombre para el lector de pantalla; por defecto, `label`. */
  accessibilityLabel?: string;
  /** Hora «HH:mm». Puede llegar inválida (p. ej. leída mal por la IA): se muestra tal cual, con `error`. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

// Hora del campo como Date para el reloj; si no es válida, abre en 08:00.
function toPickerDate(value: string) {
  const base = today();
  const [hours, minutes] = isValidTime(value) ? [Number(value.slice(0, 2)), Number(value.slice(3, 5))] : [8, 0];
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes);
}

// Campo que abre el reloj nativo de 24 h (@react-native-community/datetimepicker) y devuelve «HH:mm».
// Sustituye a escribir la hora con el teclado en «Nuevo bloque» y en la revisión del escaneo con IA.
export function TimeField({ label, accessibilityLabel, value, onChange, error, helperText }: Props) {
  const [open, setOpen] = useState(false);
  // Como en DateTimeField: onChange va en una ref para que handleChange no cambie con cada render del padre
  // (en Android, un onChange nuevo vuelve a abrir el diálogo).
  const latest = useRef(onChange);
  latest.current = onChange;

  const handleChange = useCallback((event: DateTimePickerEvent, selected?: Date) => {
    setOpen(false);
    if (event.type === 'set' && selected) latest.current(`${pad(selected.getHours())}:${pad(selected.getMinutes())}`);
  }, []);

  return (
    <View>
      {label ? (
        <>
          <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
          <View style={{ height: 6 }} />
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={() => setOpen(true)}
        style={[styles.field, { borderColor: error ? colors.error : colors.outlineVariant, borderWidth: error ? 2 : 1 }]}
      >
        <MaterialIcons name="schedule" size={20} color={colors.onSurfaceVariant} />
        <Text style={[typography.bodyLarge, styles.value, { color: colors.onSurface }]}>{value}</Text>
      </Pressable>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[typography.bodySmall, styles.hint, { color: colors.error }]}>
          {error}
        </Text>
      ) : helperText ? (
        <Text style={[typography.bodySmall, styles.hint, { color: colors.onSurfaceVariant }]}>{helperText}</Text>
      ) : null}
      {open ? <DateTimePicker value={toPickerDate(value)} mode="time" is24Hour display="default" onChange={handleChange} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: radius.xxl, paddingHorizontal: 12 },
  value: { flex: 1 },
  hint: { marginTop: 4 },
});
