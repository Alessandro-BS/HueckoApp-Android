import { MaterialIcons } from '@expo/vector-icons';
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
import { validateEmail, validateName, validatePassword } from '../../utils/validation';

export function RegisterScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Register'>) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    const nErr = validateName(name);
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setNameError(nErr);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (nErr || eErr || pErr) return;
    setServerError(null);
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al inicio de sesión"
            onPress={() => navigation.goBack()}
            style={styles.back}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={{ height: 12 }} />
          <Text style={[typography.headlineLarge, { color: colors.onSurface }]}>Crear cuenta</Text>
          <View style={{ height: 6 }} />
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            Necesitas una cuenta para compartir tu disponibilidad con un grupo.
          </Text>
          <View style={{ height: 24 }} />
          <View style={styles.card}>
            <TextField
              label="Nombre completo"
              value={name}
              onChangeText={(t) => {
                setName(t);
                setNameError(null);
              }}
              placeholder="Ana Pérez"
              leadingIcon="person-outline"
              error={nameError ?? undefined}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
            <View style={{ height: 18 }} />
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
              inputRef={emailRef}
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
              autoComplete="new-password"
              textContentType="newPassword"
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
              title="Registrarme"
              loadingTitle="Creando cuenta…"
              loading={loading}
              size="lg"
              onPress={() => void submit()}
            />
            <View style={styles.switchRow}>
              <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>¿Ya tienes cuenta?</Text>
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                hitSlop={8}
                onPress={() => navigation.goBack()}
                style={styles.linkButton}
              >
                <Text style={[typography.bodyMedium, styles.link]}>Inicia sesión</Text>
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
  content: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 20 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
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
