import type { ResolveIncidencesInput } from '@hueckoapp/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppDialog, DateTimeField, ErrorBanner } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, radius, typography } from '../../theme';
import { today } from '../../utils/clock';
import { showToast } from '../../utils/toast';
import { confirmCancelPlan } from './confirmCancelPlan';

type Choice = { state: 'PROPUESTO' | 'CANCELADO' | 'CONFIRMADO'; label: string };
const REPROGRAM: Choice = { state: 'PROPUESTO', label: 'Reprogramar' };
const CHOICES: Choice[] = [REPROGRAM, { state: 'CANCELADO', label: 'Cancelar' }, { state: 'CONFIRMADO', label: 'Mantener' }];

type Props = {
  kind: 'RECOORDINACION' | 'AVISO';
  who: string;
  reason: string;
  planTitle: string;
  canResolve: boolean;
  creatorName: string;
  onResolve: (input: ResolveIncidencesInput) => Promise<unknown>;
  onResolved?: () => void;
};

function ReprogramDialog({ loading, error, onConfirm, onDismiss }: {
  loading: boolean;
  error: string | null;
  onConfirm: (deadline: Date) => void;
  onDismiss: () => void;
}) {
  const [now] = useState(today);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const future = deadline !== null && deadline.getTime() > now.getTime();
  return (
    <AppDialog
      title="Reprogramar plan"
      confirmLabel="Abrir nueva votación"
      onConfirm={() => {
        if (deadline && future) onConfirm(deadline);
      }}
      onDismiss={onDismiss}
      confirmDisabled={!future}
      loading={loading}
    >
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        Se borrarán los votos y el grupo volverá a votar las franjas hasta la nueva fecha límite.
      </Text>
      <View style={{ height: 16 }} />
      <DateTimeField
        label="Nueva fecha límite de votación"
        value={deadline}
        onChange={setDeadline}
        minimumDate={now}
        placeholder="Elige fecha y hora"
        error={deadline && !future ? 'La fecha límite debe ser futura' : undefined}
      />
      {error ? (
        <View style={{ marginTop: 12 }}>
          <ErrorBanner message={error} />
        </View>
      ) : null}
    </AppDialog>
  );
}

// G5: «Votación exprés» si el plan se re-coordina (falta un imprescindible); «Aviso de imprevisto» si sigue confirmado
// con incidencias abiertas. Solo quien creó el plan decide (B20); reprogramar pide un plazo nuevo (G4).
export function ExpressVoteCard({ kind, who, reason, planTitle, canResolve, creatorName, onResolve, onResolved }: Props) {
  const [pending, setPending] = useState<Choice['state'] | null>(null);
  const [reprogramming, setReprogramming] = useState(false);
  const action = useAction(onResolve);

  const run = async (choice: Choice, input: ResolveIncidencesInput) => {
    setPending(choice.state);
    const result = await action.run(input);
    setPending(null);
    if (!result.ok) return;
    setReprogramming(false);
    showToast(`Votación exprés registrada: ${choice.label.toLowerCase()}.`);
    onResolved?.();
  };

  const choose = (choice: Choice) => {
    if (action.loading) return;
    if (choice.state === 'PROPUESTO') setReprogramming(true);
    // Cancelar pide la misma confirmación que «Cancelar plan» del detalle.
    else if (choice.state === 'CANCELADO') confirmCancelPlan(planTitle, () => void run(choice, { newState: 'CANCELADO' }));
    else void run(choice, { newState: choice.state });
  };

  const title = kind === 'RECOORDINACION' ? 'Votación exprés' : 'Aviso de imprevisto';
  const headline = kind === 'RECOORDINACION' ? `${who} no podrá asistir a «${planTitle}»` : `${who} reportó un imprevisto en «${planTitle}»`;

  return (
    <View style={styles.card}>
      <Text style={[typography.labelMedium, styles.warning]}>{title}</Text>
      <Text style={[typography.titleMedium, styles.headline]}>{headline}</Text>
      <Text style={[typography.bodySmall, styles.warning, styles.reason]}>{reason}</Text>
      {canResolve ? (
        <View style={styles.buttons}>
          {CHOICES.map((choice) => {
            const selected = pending === choice.state;
            return (
              <Pressable
                key={choice.state}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: action.loading }}
                disabled={action.loading}
                onPress={() => choose(choice)}
                style={[styles.choice, selected ? styles.choiceSelected : styles.choiceIdle]}
              >
                <Text style={[typography.labelMedium, { color: selected ? colors.onPrimary : colors.onSurface }]}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={[typography.bodySmall, styles.warning, styles.onlyCreator]}>{`Solo ${creatorName} puede decidir qué hacer con el plan.`}</Text>
      )}
      {action.error && !reprogramming ? (
        <View style={styles.error}>
          <ErrorBanner message={action.error} />
        </View>
      ) : null}
      {reprogramming ? (
        <ReprogramDialog
          loading={action.loading}
          error={action.error}
          onConfirm={(deadline) => void run(REPROGRAM, { newState: 'PROPUESTO', votingDeadline: deadline.toISOString() })}
          onDismiss={() => setReprogramming(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.warningContainer,
    borderWidth: 1,
    borderColor: colors.warning + '59', // warning al 35 %
    padding: 18,
  },
  warning: { color: colors.onWarningContainer },
  headline: { color: colors.onSurface, marginTop: 8 },
  reason: { marginTop: 4 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 16 },
  choice: { flex: 1, height: 48, borderRadius: radius.xxl, alignItems: 'center', justifyContent: 'center' },
  choiceIdle: { backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant },
  choiceSelected: { backgroundColor: colors.primary },
  onlyCreator: { marginTop: 16 },
  error: { marginTop: 12 },
});
