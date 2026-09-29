import type { IncidenceInput, IncidenceType } from '@hueckoapp/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, ChoiceChip, ErrorBanner, PrimaryButton, TextField } from '../../components';
import { useAction } from '../../hooks/useAction';

// Cómo lo dice quien reporta (en primera persona).
const TYPE_OPTIONS: { value: IncidenceType; label: string }[] = [
  { value: 'FALTA', label: 'No podré ir' },
  { value: 'TARDANZA', label: 'Llegaré tarde' },
  { value: 'IMPREVISTO', label: 'Otro imprevisto' },
];

type Props = { onReport: (input: IncidenceInput) => Promise<unknown>; onDone: () => void; onDismiss: () => void };

// C4: motivo obligatorio; una tardanza lleva minutos (1–600). La criticidad la pone el servidor (G6).
export function ReportIncidenceSheet({ onReport, onDone, onDismiss }: Props) {
  const [type, setType] = useState<IncidenceType>('FALTA');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('');
  const action = useAction(onReport);

  const delay = Number(minutes);
  const minutesValid = minutes.length > 0 && delay >= 1 && delay <= 600;
  const valid = reason.trim().length > 0 && (type !== 'TARDANZA' || minutesValid);

  const submit = async () => {
    if (!valid || action.loading) return;
    const result = await action.run({ type, reason: reason.trim(), delayMinutes: type === 'TARDANZA' ? delay : null });
    if (result.ok) onDone();
  };

  return (
    <BottomSheet
      title="Reportar un imprevisto"
      subtitle="Avisa al grupo si no podrás ir o llegarás tarde."
      onDismiss={onDismiss}
      dismissable={!action.loading}
    >
      <View style={styles.options}>
        {TYPE_OPTIONS.map((option) => (
          <ChoiceChip key={option.value} label={option.label} selected={type === option.value} onPress={() => setType(option.value)} />
        ))}
      </View>
      <TextField
        label="¿Qué pasó?"
        value={reason}
        onChangeText={setReason}
        placeholder="Cuéntale al grupo qué pasó"
        maxLength={200}
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      {type === 'TARDANZA' ? (
        <TextField
          label="Minutos de retraso"
          value={minutes}
          onChangeText={(text) => setMinutes(text.replace(/\D/g, ''))}
          placeholder="20"
          keyboardType="number-pad"
          maxLength={3}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          helperText="Entre 1 y 600 minutos."
        />
      ) : null}
      {action.error ? <ErrorBanner message={action.error} /> : null}
      <PrimaryButton title="Reportar" loadingTitle="Enviando…" loading={action.loading} disabled={!valid} onPress={() => void submit()} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
