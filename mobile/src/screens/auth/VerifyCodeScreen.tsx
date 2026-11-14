import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resendChallengeRequest } from '../../api/auth';
import { ApiError, errorMessage } from '../../api/client';
import { CodeInput, ErrorBanner, PrimaryButton, SecondaryButton, TextField } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useResendCountdown } from '../../hooks/useResendCountdown';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, radius, typography } from '../../theme';
import { showToast } from '../../utils/toast';
import { validatePassword } from '../../utils/validation';

const CODE_LENGTH = 6;

export function VerifyCodeScreen({ navigation, route }: NativeStackScreenProps<AuthStackParamList, 'VerifyCode'>) {
  const { challenge } = route.params;
  const { completeChallenge } = useAuth();
  const isReset = challenge.purpose === 'RESET_PASSWORD';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { secondsLeft, restart } = useResendCountdown(challenge.resendAvailableAt);

  const submit = async () => {
    if (loading || expired) return;
    if (code.length !== CODE_LENGTH) {
      setServerError('Escribe los 6 dígitos del código.');
      return;
    }
    if (isReset) {
      const pErr = validatePassword(password);
      const rErr = pErr ? null : password !== repeat ? 'Las contraseñas no coinciden' : null;
      setPasswordError(pErr);
      setRepeatError(rErr);
      if (pErr || rErr) return;
    }
    setServerError(null);
    setLoading(true);
    try {
      await completeChallenge(challenge.id, code, isReset ? password : undefined);
      showToast(isReset ? 'Contraseña actualizada. Bienvenido a HueckoApp.' : '¡Sesión iniciada con éxito! Bienvenido a HueckoApp.');
    } catch (e) {
      setServerError(errorMessage(e));
      if (e instanceof ApiError && e.code === 'CHALLENGE_EXPIRED') setExpired(true);
      else if (e instanceof ApiError && e.code === 'CODE_INVALID') setCode('');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (secondsLeft > 0 || resending || expired) return;
    setResending(true);
    setServerError(null);
    try {
      await resendChallengeRequest(challenge.id);
      showToast('Te enviamos un código nuevo.');
      restart(new Date(Date.now() + 60_000).toISOString());
    } catch (e) {
      if (e instanceof ApiError && e.code === 'RESEND_TOO_SOON') {
        const retry = (e.details as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
        if (typeof retry === 'number') restart(new Date(Date.now() + retry * 1000).toISOString());
      } else {
        setServerError(errorMessage(e));
        if (e instanceof ApiError && e.code === 'CHALLENGE_EXPIRED') setExpired(true);
      }
    } finally {
      setResending(false);
    }
  };

  const canResend = secondsLeft === 0 && !resending && !expired;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => navigation.goBack()} style={styles.back}>
            <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={{ height: 12 }} />
          <Text style={[typography.headlineLarge, { color: colors.onSurface }]}>Escribe el código</Text>
          <View style={{ height: 6 }} />
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            {`Te enviamos un código a ${challenge.emailHint}`}
          </Text>
          <View style={{ height: 24 }} />
          <View style={styles.card}>
            <CodeInput
              value={code}
              onChange={(c) => {
                setCode(c);
                setServerError(null);
              }}
              autoFocus
            />
            {isReset ? (
              <>
                <View style={{ height: 18 }} />
                <TextField
                  label="Contraseña nueva"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    setPasswordError(null);
                  }}
                  placeholder="Al menos 8 caracteres"
                  leadingIcon="lock-outline"
                  error={passwordError ?? undefined}
                  secureToggle
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                />
                <View style={{ height: 18 }} />
                <TextField
                  label="Repite la contraseña"
                  value={repeat}
                  onChangeText={(t) => {
                    setRepeat(t);
                    setRepeatError(null);
                  }}
                  placeholder="Repite la contraseña"
                  leadingIcon="lock-outline"
                  error={repeatError ?? undefined}
                  secureToggle
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={() => void submit()}
                />
              </>
            ) : null}
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
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  card: {
    padding: 24,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
});
