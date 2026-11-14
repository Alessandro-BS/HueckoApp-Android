import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { verifyChallengeRequest } from '../../api/auth';
import { CodeInput, ErrorBanner, PrimaryButton, SecondaryButton } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useChallengeCode } from '../../hooks/useChallengeCode';
import type { AppStackParamList } from '../../navigation/types';
import { colors, radius, typography } from '../../theme';
import { showToast } from '../../utils/toast';

// Código del correo para activar la verificación en dos pasos. La sesión ya existe: el servidor responde 204.
export function EnableTwoFactorScreen({ navigation, route }: NativeStackScreenProps<AppStackParamList, 'EnableTwoFactor'>) {
  const { challenge } = route.params;
  const { refreshUser } = useAuth();
  const { code, setCode, serverError, expired, loading, resending, secondsLeft, canResend, submit: submitCode, resend } = useChallengeCode(challenge);

  const submit = () =>
    submitCode(async (value) => {
      await verifyChallengeRequest(challenge.id, value);
      await refreshUser().catch(() => undefined); // ya quedó activa en el servidor; el perfil se actualiza al volver a primer plano
      showToast('Verificación en dos pasos activada.');
      navigation.goBack();
    });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <MaterialIcons name="shield" size={24} color={colors.primary} />
            <Text style={[typography.headlineLarge, { color: colors.onSurface }]}>Escribe el código</Text>
          </View>
          <View style={{ height: 6 }} />
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            {`Te enviamos un código a ${challenge.emailHint}`}
          </Text>
          <View style={{ height: 24 }} />
          <View style={styles.card}>
            <CodeInput
              value={code}
              onChange={setCode}
              autoFocus
            />
            {serverError ? (
              <View style={{ marginTop: 16 }}>
                <ErrorBanner message={serverError} />
              </View>
            ) : null}
            <View style={{ height: 24 }} />
            {expired ? (
              <PrimaryButton title="Volver" size="lg" onPress={() => navigation.goBack()} />
            ) : (
              <PrimaryButton title="Verificar" loadingTitle="Verificando…" loading={loading} size="lg" onPress={() => void submit()} />
            )}
            <View style={{ height: 12 }} />
            <SecondaryButton
              title={secondsLeft > 0 ? `Reenviar en ${secondsLeft} s` : 'Reenviar código'}
              disabled={!canResend}
              loading={resending}
              onPress={() => void resend()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: {
    padding: 24,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
});
