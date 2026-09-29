import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
  confirmDisabled?: boolean;
  loading?: boolean;
};

// AlertDialog M3 (UI spec §2.5). Mientras carga no se puede cerrar (ni tocando fuera ni con Atrás), igual que en Kotlin.
export function AppDialog({ title, children, confirmLabel, onConfirm, onDismiss, confirmDisabled = false, loading = false }: Props) {
  const dismiss = () => {
    if (!loading) onDismiss();
  };
  const blocked = confirmDisabled || loading;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Cerrar diálogo" style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{title}</Text>
          <View style={styles.body}>{children}</View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={loading} onPress={dismiss} style={styles.textButton}>
              <Text style={[typography.labelLarge, { color: loading ? colors.disabledContent : colors.primary }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ disabled: blocked, busy: loading }}
              disabled={blocked}
              onPress={onConfirm}
              style={[styles.confirm, { backgroundColor: confirmDisabled ? colors.disabledContainer : colors.primary }]}
            >
              {loading ? (
                <ActivityIndicator size={16} color={colors.onPrimary} />
              ) : (
                <Text style={[typography.labelLarge, { color: confirmDisabled ? colors.disabledContent : colors.onPrimary }]}>
                  {confirmLabel}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(29,27,32,0.32)' },
  card: { borderRadius: 28, backgroundColor: colors.surfaceContainerHigh, padding: 24 },
  body: { marginTop: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 24 },
  textButton: { height: 40, paddingHorizontal: 12, justifyContent: 'center' },
  confirm: { height: 40, minWidth: 88, paddingHorizontal: 24, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
