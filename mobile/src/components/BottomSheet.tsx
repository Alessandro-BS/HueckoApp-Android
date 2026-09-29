import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';

type Props = { title: string; subtitle?: string; onDismiss: () => void; dismissable?: boolean; children: ReactNode };

// ModalBottomSheet M3 (UI spec §2.6/§2.7): esquinas superiores de 28, asa y fondo oscurecido.
// Tocar fuera o Atrás la cierra, salvo mientras se envía (`dismissable = false`).
export function BottomSheet({ title, subtitle, onDismiss, dismissable = true, children }: Props) {
  const dismiss = () => {
    if (dismissable) onDismiss();
  };
  return (
    <Modal transparent visible animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Cerrar" style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{title}</Text>
          {subtitle ? <Text style={[typography.bodySmall, styles.subtitle]}>{subtitle}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(29,27,32,0.32)' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: { alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: colors.onSurfaceVariant, opacity: 0.4, marginBottom: 16 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 4 },
  body: { gap: 12, paddingTop: 16 },
});
