import { AntDesign } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { isGoogleSignInAvailable } from '../auth/googleSignIn';
import { colors, radius, typography } from '../theme';

type Props = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/** Separador «o» y botón «Continuar con Google». No se dibuja en Expo Go ni sin `googleWebClientId`. */
export function GoogleButton({ onPress, loading = false, disabled = false }: Props) {
  if (!isGoogleSignInAvailable()) return null;
  const blocked = disabled || loading;
  return (
    <View>
      <View style={styles.separator}>
        <View style={styles.line} />
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>o</Text>
        <View style={styles.line} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked, busy: loading }}
        disabled={blocked}
        onPress={onPress}
        style={styles.button}
      >
        {loading ? <ActivityIndicator size={18} color={colors.onSurface} /> : <AntDesign name="google" size={18} color={colors.onSurface} />}
        <Text numberOfLines={1} style={[typography.labelLarge, { color: blocked ? colors.disabledContent : colors.onSurface }]}>
          Continuar con Google
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  separator: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  line: { flex: 1, height: 1, backgroundColor: colors.outlineVariant },
  button: {
    height: 52,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
});
