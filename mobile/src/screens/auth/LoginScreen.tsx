import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '../../api/client';
import { ErrorBanner, PrimaryButton, TextField } from '../../components';
import { useAuth } from '../../context/AuthContext';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, radius, typography } from '../../theme';
import { showToast } from '../../utils/toast';
import { validateEmail, validatePassword } from '../../utils/validation';

export function LoginScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Login'>) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (loading) return;
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;
    setServerError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      showToast('¡Sesión iniciada con éxito! Bienvenido a HueckoApp.');
    } catch (e) {
      setServerError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandLetter}>H</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[typography.headlineMedium, { color: colors.onSurface }]}>Huecko</Text>
              <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
                Coordinar horarios sin discutirlo en el grupo
              </Text>
            </View>
          </View>
          <View style={{ height: 32 }} />
          <View style={styles.card}>
            <Text style={[typography.headlineMedium, { color: colors.onSurface }]}>Bienvenido de vuelta</Text>
            <View style={{ height: 6 }} />
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
              Inicia sesión para coordinar horarios con tu grupo.
            </Text>
            <View style={{ height: 24 }} />
            <TextField
              label="Correo electrónico"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setEmailError(null);
              }}
              placeholder="tucorreo@ejemplo.com"
              leadingIcon="mail-outline"
              error={emailError ?? undefined}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <View style={{ height: 18 }} />
            <TextField
              label="Contraseña"
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
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              inputRef={passwordRef}
            />
            {serverError ? (
              <View style={{ marginTop: 16 }}>
                <ErrorBanner message={serverError} />
              </View>
            ) : null}
            <View style={{ height: 24 }} />
            <PrimaryButton
              title="Iniciar sesión"
              loadingTitle="Iniciando sesión…"
              loading={loading}
              size="lg"
              onPress={() => void submit()}
            />
            <View style={styles.switchRow}>
              <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>¿No tienes cuenta?</Text>
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                hitSlop={8}
                onPress={() => navigation.navigate('Register')}
                style={styles.linkButton}
              >
                <Text style={[typography.bodyMedium, styles.link]}>Regístrate</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  brandMark: { width: 52, height: 52, borderRadius: radius.xxl, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandLetter: { fontSize: 26, fontWeight: '700', color: colors.onPrimary },
  card: {
    padding: 24,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 4 },
  linkButton: { paddingVertical: 8, paddingHorizontal: 4 },
  link: { fontWeight: '700', color: colors.primary },
});
