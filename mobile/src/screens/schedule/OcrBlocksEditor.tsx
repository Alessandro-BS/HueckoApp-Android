import { MaterialIcons } from '@expo/vector-icons';
import type { TimeBlockInput } from '@hueckoapp/shared';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createTimeBlocksBulk } from '../../api/schedule';
import { AiDemoHint, DaySelector, ErrorBanner, HueckoCard, PrimaryButton, SecondaryButton, TextField } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, typography } from '../../theme';
import { ocrCountLabel } from '../../utils/ai';
import { dayLong } from '../../utils/days';
import { endTimeHint, isValidRange, startTimeHint } from '../../utils/time';

type Draft = { key: string; label: string; dayOfWeek: number; startTime: string; endTime: string };

type Props = { initial: readonly TimeBlockInput[]; onDiscard: () => void; onSaved: (count: number) => void };

const isValidDraft = (d: Draft) => d.label.trim().length > 0 && isValidRange(d.startTime, d.endTime);

const toBlockInput = (d: Draft): TimeBlockInput => ({
  label: d.label.trim(), type: 'CLASE', startTime: d.startTime, endTime: d.endTime, isRecurring: true, dayOfWeek: d.dayOfWeek, date: null,
});

type CardProps = { draft: Draft; index: number; onChange: (patch: Partial<Draft>) => void; onRemove: () => void };

function DraftCard({ draft, index, onChange, onRemove }: CardProps) {
  const n = index + 1;
  const startHint = startTimeHint(draft.startTime);
  const endHint = endTimeHint(draft.startTime, draft.endTime);
  return (
    <HueckoCard padding={14} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={[typography.titleSmall, styles.flex, { color: colors.onSurface }]}>{`Bloque ${n}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar bloque ${n}`} onPress={onRemove} style={styles.iconButton}>
          <MaterialIcons name="delete-outline" size={22} color={colors.error} />
        </Pressable>
      </View>
      <TextField
        label="Nombre"
        accessibilityLabel={`Nombre del bloque ${n}`}
        value={draft.label}
        onChangeText={(label) => onChange({ label })}
        maxLength={80}
        autoCapitalize="sentences"
        error={draft.label.trim() ? undefined : 'El nombre es requerido'}
      />
      <DaySelector selected={draft.dayOfWeek} onSelect={(dayOfWeek) => onChange({ dayOfWeek })} captionFor={() => ''}
        chipLabel={(iso) => `Bloque ${n}: ${dayLong(iso).toLowerCase()}`}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Inicio (HH:mm)"
            accessibilityLabel={`Inicio del bloque ${n}`}
            value={draft.startTime}
            onChangeText={(startTime) => onChange({ startTime })}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            error={startHint.error ? startHint.text : undefined}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="Fin (HH:mm)"
            accessibilityLabel={`Fin del bloque ${n}`}
            value={draft.endTime}
            onChangeText={(endTime) => onChange({ endTime })}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            error={endHint.error ? endHint.text : undefined}
          />
        </View>
      </View>
    </HueckoCard>
  );
}

// Lista editable de lo que leyó la IA (D10: arregla quirk 16 y B13). Guarda todo junto con /me/time-blocks/bulk.
export function OcrBlocksEditor({ initial, onDiscard, onSaved }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    initial.map((b, i) => ({ key: String(i), label: b.label, dayOfWeek: b.dayOfWeek ?? 1, startTime: b.startTime, endTime: b.endTime })),
  );
  const save = useAction(createTimeBlocksBulk);
  // Si la pantalla se cerró mientras guardaba, onSaved no debe volver a navegar (sacaría al usuario de «Mi horario»).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const canSave = drafts.length > 0 && drafts.every(isValidDraft);

  const update = (key: string, patch: Partial<Draft>) => setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const remove = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const submit = async () => {
    if (!canSave) return;
    const result = await save.run(drafts.map(toBlockInput));
    if (result.ok && mounted.current) onSaved(result.value.length);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <HueckoCard containerColor={colors.primaryContainer} borderColor={colors.primaryContainer} padding={16}>
          <Text style={[typography.titleMedium, styles.onContainer]}>{ocrCountLabel(drafts.length)}</Text>
          <Text style={[typography.bodyMedium, styles.onContainer, styles.gapTop]}>
            Revísalos antes de confirmar: se sumarán a tu horario y afectarán a los huecos que vean tus grupos.
          </Text>
          <Text style={[typography.bodySmall, styles.onContainer, styles.gapTop]}>
            Corrige lo que Huecko IA haya leído mal o quita lo que sobre.
          </Text>
        </HueckoCard>
        <AiDemoHint />
        {drafts.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            Quitaste todos los bloques. Vuelve a escanear o añádelos a mano.
          </Text>
        ) : (
          drafts.map((d, i) => (
            <DraftCard key={d.key} draft={d} index={i} onChange={(patch) => update(d.key, patch)} onRemove={() => remove(d.key)} />
          ))
        )}
        {save.error ? <ErrorBanner message={save.error} /> : null}
        <View style={styles.actions}>
          <SecondaryButton title="Descartar" style={styles.flex} disabled={save.loading} onPress={onDiscard} />
          <PrimaryButton
            title="Añadir a mi horario"
            loadingTitle="Guardando…"
            loading={save.loading}
            disabled={!canSave}
            style={styles.flex}
            onPress={() => void submit()}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  onContainer: { color: colors.onPrimaryContainer },
  gapTop: { marginTop: 4 },
  card: { gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  row: { flexDirection: 'row', gap: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
