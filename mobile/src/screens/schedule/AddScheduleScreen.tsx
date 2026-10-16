import type { BlockType } from '@hueckoapp/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createTimeBlock } from '../../api/schedule';
import { ChoiceChip, DateTimeField, ErrorBanner, PrimaryButton, TextField, TimeField } from '../../components';
import { useAction } from '../../hooks/useAction';
import type { AppStackScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { dayLong, dayShort, parseDateKey, toDateKey, WEEK_DAYS } from '../../utils/days';
import { endTimeHint, isValidRange, startTimeHint } from '../../utils/time';
import { showToast } from '../../utils/toast';

const BLOCK_TYPES: { value: BlockType; label: string }[] = [
  { value: 'CLASE', label: 'Clase' },
  { value: 'TRABAJO', label: 'Trabajo' },
  { value: 'LIBRE', label: 'Libre' },
  { value: 'PUNTUAL', label: 'Puntual' },
];

function FieldLabel({ children }: { children: string }) {
  return <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{children}</Text>;
}

export function AddScheduleScreen({ navigation, route }: AppStackScreen<'AddSchedule'>) {
  const [now] = useState(today);
  const [label, setLabel] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);
  const [dayOfWeek, setDayOfWeek] = useState(route.params?.initialDay ?? 1);
  const [date, setDate] = useState(() => toDateKey(now));
  // Un puntual no puede caer antes de hoy.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [type, setType] = useState<BlockType>('CLASE');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const save = useAction(createTimeBlock);

  const startHint = startTimeHint(startTime);
  const endHint = endTimeHint(startTime, endTime);
  // El nombre vacío solo deshabilita el botón, sin mensaje (como en Kotlin).
  const formValid = label.trim().length > 0 && isValidRange(startTime, endTime);

  // G12: por defecto CLASE si es recurrente y PUNTUAL si es de una sola vez.
  const chooseRecurring = (value: boolean) => {
    setIsRecurring(value);
    setType(value ? 'CLASE' : 'PUNTUAL');
  };

  const submit = async () => {
    if (!formValid) return;
    const result = await save.run({
      label: label.trim(),
      type,
      startTime,
      endTime,
      isRecurring,
      dayOfWeek: isRecurring ? dayOfWeek : null,
      date: isRecurring ? null : date,
    });
    if (result.ok) {
      showToast('Bloque guardado.');
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Nombre del bloque"
          value={label}
          onChangeText={setLabel}
          placeholder="Clase de Cálculo"
          maxLength={80}
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        <View style={styles.section}>
          <FieldLabel>Repetición</FieldLabel>
          <View style={styles.row}>
            <ChoiceChip label="Recurrente" selected={isRecurring} onPress={() => chooseRecurring(true)} style={styles.flex} />
            <ChoiceChip label="Puntual (Única vez)" selected={!isRecurring} onPress={() => chooseRecurring(false)} style={styles.flex} />
          </View>
        </View>

        {isRecurring ? (
          <View style={styles.section}>
            <FieldLabel>Día de la semana</FieldLabel>
            <View style={styles.wrap}>
              {WEEK_DAYS.map((iso) => (
                <ChoiceChip
                  key={iso}
                  variant="title"
                  label={dayShort(iso)}
                  accessibilityLabel={dayLong(iso)}
                  selected={dayOfWeek === iso}
                  onPress={() => setDayOfWeek(iso)}
                  style={styles.dayChip}
                />
              ))}
            </View>
          </View>
        ) : (
          <DateTimeField
            label="Fecha"
            mode="date"
            value={parseDateKey(date)}
            minimumDate={startOfToday}
            onChange={(value) => setDate(toDateKey(value))}
          />
        )}

        <View style={styles.section}>
          <FieldLabel>Tipo de bloque</FieldLabel>
          <View style={styles.wrap}>
            {BLOCK_TYPES.map((option) => (
              <ChoiceChip key={option.value} label={option.label} selected={type === option.value} onPress={() => setType(option.value)} />
            ))}
          </View>
          {type === 'LIBRE' ? (
            <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
              Un bloque libre no te marca como ocupado en los huecos de tus grupos.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <FieldLabel>Horario</FieldLabel>
          <View style={styles.row}>
            <View style={styles.flex}>
              <TimeField
                accessibilityLabel="Hora de inicio"
                value={startTime}
                onChange={setStartTime}
                error={startHint.error ? startHint.text : undefined}
                helperText={startHint.error ? undefined : startHint.text}
              />
            </View>
            <View style={styles.flex}>
              <TimeField
                accessibilityLabel="Hora de fin"
                value={endTime}
                onChange={setEndTime}
                error={endHint.error ? endHint.text : undefined}
                helperText={endHint.error ? undefined : endHint.text}
              />
            </View>
          </View>
        </View>

        {save.error ? <ErrorBanner message={save.error} /> : null}
        <PrimaryButton
          title="Guardar bloque"
          loadingTitle="Guardando…"
          loading={save.loading}
          disabled={!formValid}
          onPress={() => void submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  section: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { minWidth: 56 },
});
