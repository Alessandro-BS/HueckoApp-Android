import type { ExpressOption, Proposal, ReplanInput } from '@hueckoapp/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorBanner, PrimaryButton } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, radius, typography } from '../../theme';
import { today } from '../../utils/clock';
import { showToast } from '../../utils/toast';
import { closesInLabel } from '../../utils/zone';
import { ReplanSheet } from './ReplanSheet';

const OPTIONS: { option: ExpressOption; label: string }[] = [
  { option: 'CANCELAR', label: 'Cancelar' },
  { option: 'REAGENDAR', label: 'Reagendar' },
  { option: 'MANTENER', label: 'Mantener' },
];
const LABEL: Record<ExpressOption, string> = { CANCELAR: 'Cancelar', REAGENDAR: 'Reagendar', MANTENER: 'Mantener' };

const votesLabel = (n: number) => `${n} ${n === 1 ? 'voto' : 'votos'}`;

type Props = {
  proposal: Proposal;
  onVote: (option: ExpressOption) => Promise<unknown>;
  onReplan: (input: ReplanInput) => Promise<unknown>;
  /** Solo para tests: por defecto, el reloj de la app. */
  now?: Date;
};

// Votación exprés del grupo (docs/api.md, «Votación exprés»): una ausencia crítica abre una votación corta con tres
// opciones; vota cada miembro menos quien avisó y el resultado lo aplica el servidor. Si el grupo decidió reagendar
// (plan EN_RECOORDINACION), quien gestiona propone franjas nuevas con el mismo ReplanSheet de «Replantear».
export function ExpressVoteCard({ proposal, onVote, onReplan, now: nowProp }: Props) {
  const now = nowProp ?? today();
  const vote = proposal.expressVote;
  const [pending, setPending] = useState<ExpressOption | null>(null);
  const [replanning, setReplanning] = useState(false);
  const action = useAction(onVote);

  const choose = async (option: ExpressOption) => {
    if (!vote?.canVote || action.loading || option === vote.myVote) return;
    setPending(option);
    const result = await action.run(option);
    setPending(null);
    if (result.ok) showToast('Tu voto ha sido registrado.');
  };

  const recoordinating = proposal.state === 'EN_RECOORDINACION';

  return (
    <View style={styles.card}>
      <Text style={[typography.labelMedium, styles.warning]}>{vote ? 'Votación exprés' : 'Plan en recoordinación'}</Text>
      {vote ? (
        <>
          <Text style={[typography.titleMedium, styles.headline]}>{`${vote.reportedBy.name} no podrá asistir`}</Text>
          <Text style={[typography.bodySmall, styles.warning, styles.gap4]}>{vote.reason}</Text>
          <Text style={[typography.bodySmall, styles.warning, styles.gap4]}>{`Ausencia crítica: ${vote.criticalReason}`}</Text>
        </>
      ) : null}

      {vote?.status === 'ABIERTA' ? (
        <>
          <Text style={[typography.titleSmall, styles.headline, styles.gap12]}>¿Qué hacemos con el plan?</Text>
          <View style={styles.buttons}>
            {OPTIONS.map(({ option, label }) => {
              const selected = (pending ?? vote.myVote) === option;
              const disabled = !vote.canVote || action.loading;
              const fg = selected ? colors.onPrimary : colors.onSurface;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, ${votesLabel(vote.counts[option])}`}
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => void choose(option)}
                  style={[styles.choice, selected ? styles.choiceSelected : styles.choiceIdle, disabled && !selected ? styles.choiceDisabled : null]}
                >
                  <Text style={[typography.labelMedium, { color: fg }]}>{label}</Text>
                  <Text style={[typography.bodySmall, { color: fg }]}>{String(vote.counts[option])}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[typography.bodySmall, styles.warning, styles.gap8]}>{closesInLabel(vote.expiresAt, now)}</Text>
          {!vote.canVote ? <Text style={[typography.bodySmall, styles.warning, styles.gap4]}>No votas en esta votación.</Text> : null}
          {vote.recommendation ? (
            <Text style={[typography.bodySmall, styles.headline, styles.gap8]}>
              {`Huecko sugiere: ${LABEL[vote.recommendation.option]} — ${vote.recommendation.reason}`}
            </Text>
          ) : null}
          {action.error ? (
            <View style={styles.gap12}>
              <ErrorBanner message={action.error} />
            </View>
          ) : null}
        </>
      ) : null}

      {vote?.status === 'CERRADA' && vote.result ? (
        <Text style={[typography.titleSmall, styles.headline, styles.gap12]}>
          {vote.resultByDefault ? 'Sin quórum: el plan se mantiene' : `El grupo decidió: ${LABEL[vote.result]}`}
        </Text>
      ) : null}

      {recoordinating ? (
        <View style={styles.gap12}>
          <Text style={[typography.bodySmall, styles.warning]}>Hay que buscar una fecha nueva para el plan.</Text>
          {proposal.canManage ? (
            <PrimaryButton title="Proponer franjas" icon="edit-calendar" style={styles.gap12} onPress={() => setReplanning(true)} />
          ) : (
            <Text style={[typography.bodySmall, styles.warning, styles.gap4]}>Quien organiza el plan propondrá franjas nuevas.</Text>
          )}
        </View>
      ) : null}

      {replanning ? (
        <ReplanSheet
          title="Proponer franjas nuevas"
          submitLabel="Abrir nueva votación"
          // Lanza si el servidor rechaza: la hoja muestra el error y se queda abierta.
          onSubmit={async (input) => {
            await onReplan(input);
            setReplanning(false);
            showToast('Franjas propuestas: el grupo vuelve a votar la fecha.');
          }}
          onDismiss={() => setReplanning(false)}
          now={nowProp}
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
  gap4: { marginTop: 4 },
  gap8: { marginTop: 8 },
  gap12: { marginTop: 12 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  choice: { flex: 1, minHeight: 56, paddingVertical: 6, borderRadius: radius.xxl, alignItems: 'center', justifyContent: 'center' },
  choiceIdle: { backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant },
  choiceSelected: { backgroundColor: colors.primary },
  choiceDisabled: { opacity: 0.6 },
});
