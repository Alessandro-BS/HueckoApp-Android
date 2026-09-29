import type { TimeWindow } from '@hueckoapp/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppDialog, ChoiceChip, ErrorBanner } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, typography } from '../../theme';
import { voteCountLabel, windowLabel } from '../../utils/proposals';

const MOST_VOTED = 'MOST_VOTED';

type Props = {
  windows: TimeWindow[];
  onConfirm: (windowId?: string) => Promise<unknown>;
  onDone: () => void;
  onDismiss: () => void;
};

// C2: quien creó el plan elige la franja o deja «La más votada» (el servidor desempata).
// Sin votos hay que elegir una franja: el servidor respondería 409 NO_VOTES.
export function ConfirmPlanDialog({ windows, onConfirm, onDone, onDismiss }: Props) {
  const anyVotes = windows.some((w) => w.voteCount > 0);
  const [choice, setChoice] = useState<string | null>(anyVotes ? MOST_VOTED : null);
  const action = useAction(onConfirm);

  const confirm = async () => {
    if (!choice) return;
    const result = await action.run(choice === MOST_VOTED ? undefined : choice);
    if (result.ok) onDone();
  };

  return (
    <AppDialog
      title="Confirmar plan"
      confirmLabel="Confirmar"
      onConfirm={() => void confirm()}
      onDismiss={onDismiss}
      confirmDisabled={!choice}
      loading={action.loading}
    >
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        Elige la franja del plan. Con «La más votada» gana la que tenga más votos.
      </Text>
      <View style={styles.options}>
        {anyVotes ? <ChoiceChip label="La más votada" selected={choice === MOST_VOTED} onPress={() => setChoice(MOST_VOTED)} /> : null}
        {windows.map((w) => (
          <ChoiceChip
            key={w.id}
            label={`${windowLabel(w)} · ${voteCountLabel(w.voteCount)}`}
            selected={choice === w.id}
            onPress={() => setChoice(w.id)}
          />
        ))}
      </View>
      {action.error ? (
        <View style={styles.error}>
          <ErrorBanner message={action.error} />
        </View>
      ) : null}
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  options: { gap: 8, marginTop: 16 },
  error: { marginTop: 12 },
});
