import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { forgotPasswordRequest } from '../../api/auth';
import { errorMessage } from '../../api/client';
import { ErrorBanner, PrimaryButton, TextField } from '../../components';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, radius, typography } from '../../theme';
import { validateEmail } from '../../utils/validation';

export function ForgotPasswordScreen({ navigation, route }: NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>) {
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    const eErr = validateEmail(email);
    setEmailError(eErr);
    if (eErr) return;
    setServerError(null);
    setLoading(true);
    try {
      const { challenge } = await forgotPasswordRequest(email.trim());
      navigation.navigate('VerifyCode', { challenge });
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
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => navigation.goBack()} style={styles.back}>
            <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={{ height: 12 }} />
          <Text style={[typography.headlineLarge, { color: colors.onSurface }]}>Recuperar contraseña</Text>
          <View style={{ height: 6 }} />
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            Escribe tu correo y te enviaremos un código para crear una contraseña nueva.
          </Text>
          <View style={{ height: 24 }} />
          <View style={styles.card}>
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
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
            />
            {serverError ? (
              <View style={{ marginTop: 16 }}>
                <ErrorBanner message={serverError} />
              </View>
            ) : null}
            <View style={{ height: 24 }} />
            <PrimaryButton title="Enviar código" loadingTitle="Enviando…" loading={loading} size="lg" onPress={() => void submit()} />
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
