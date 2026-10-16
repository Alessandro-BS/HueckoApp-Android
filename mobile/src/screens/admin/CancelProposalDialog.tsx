import type { AdminProposalSummary } from '@hueckoapp/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppDialog, ErrorBanner, TextField } from '../../components';
import { colors, typography } from '../../theme';

type Props = {
  proposal: AdminProposalSummary;
  loading: boolean;
  error: string | null;
  onConfirm: (reason: string) => void; // ya recortado, de 3 a 200 caracteres
  onDismiss: () => void;
  /** Al editar el motivo (p. ej. para borrar el error del intento anterior). */
  onReasonChange?: () => void;
};

// Moderación (D7, A5): cancelar una propuesta de cualquier grupo exige un motivo (3-200 caracteres) que queda en el registro.
export const REASON_MIN = 3;
export const REASON_MAX = 200;

export function CancelProposalDialog({ proposal, loading, error, onConfirm, onDismiss, onReasonChange }: Props) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= REASON_MIN;
  return (
    <AppDialog
      title="Cancelar propuesta"
      confirmLabel="Sí, cancelar"
      onConfirm={() => onConfirm(reason.trim())}
      onDismiss={onDismiss}
      confirmDisabled={!valid}
      loading={loading}
    >
      <View style={styles.body}>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          {`«${proposal.title}» pasará a «Cancelado» para todo el grupo. Quedará en el registro de acciones.`}
        </Text>
        <TextField
          label="Motivo"
          value={reason}
          onChangeText={(text) => {
            setReason(text);
            onReasonChange?.();
          }}
          maxLength={REASON_MAX}
          multiline
          helperText={`Obligatorio, de ${REASON_MIN} a ${REASON_MAX} caracteres.`}
        />
        {error ? <ErrorBanner message={error} /> : null}
      </View>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
});
