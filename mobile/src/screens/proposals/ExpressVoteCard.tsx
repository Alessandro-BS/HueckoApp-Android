import type { ResolveIncidencesInput } from '@hueckoapp/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorBanner } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, radius, typography } from '../../theme';
import { showToast } from '../../utils/toast';
import { confirmCancelPlan } from './confirmCancelPlan';
import { ReplanSheet } from './ReplanSheet';

type Choice = { state: 'PROPUESTO' | 'CANCELADO' | 'CONFIRMADO'; label: string };
const REPROGRAM: Choice = { state: 'PROPUESTO', label: 'Reprogramar' };
const CHOICES: Choice[] = [REPROGRAM, { state: 'CANCELADO', label: 'Cancelar' }, { state: 'CONFIRMADO', label: 'Mantener' }];

type Props = {
  kind: 'RECOORDINACION' | 'AVISO';
  who: string;
  reason: string;
  planTitle: string;
  canResolve: boolean;
  onResolve: (input: ResolveIncidencesInput) => Promise<unknown>;
  onResolved?: () => void;
};

// G5: «Votación exprés» si el plan se re-coordina (falta un imprescindible); «Aviso de imprevisto» si sigue confirmado
// con incidencias abiertas. Solo quien gestiona el plan decide (B20, canManage); reprogramar pide plazo y franjas nuevas (G4).
export function ExpressVoteCard({ kind, who, reason, planTitle, canResolve, onResolve, onResolved }: Props) {
  const [pending, setPending] = useState<Choice['state'] | null>(null);
  const [reprogramming, setReprogramming] = useState(false);
  const action = useAction(onResolve);

  const run = async (choice: Choice, input: ResolveIncidencesInput) => {
    setPending(choice.state);
    const result = await action.run(input);
    setPending(null);
    if (!result.ok) return;
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
        <Text style={[typography.bodySmall, styles.warning, styles.onlyManager]}>{'Solo quien organiza el plan puede decidir qué hacer con él.'}</Text>
      )}
      {action.error ? (
        <View style={styles.error}>
          <ErrorBanner message={action.error} />
        </View>
      ) : null}
      {reprogramming ? (
        <ReplanSheet
          title="Reprogramar plan"
          submitLabel="Abrir nueva votación"
          // Lanza si el servidor rechaza: la hoja muestra el error y se queda abierta.
          onSubmit={async (input) => {
            await onResolve({ newState: 'PROPUESTO', ...input });
            setReprogramming(false);
            showToast(`Votación exprés registrada: ${REPROGRAM.label.toLowerCase()}.`);
            onResolved?.();
          }}
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
  onlyManager: { marginTop: 16 },
  error: { marginTop: 12 },
});
