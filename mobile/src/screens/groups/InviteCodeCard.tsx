import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../../theme';
import { showToast } from '../../utils/toast';

export function InviteCodeCard({ code }: { code: string }) {
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    showToast(`Código ${code} copiado.`);
  };

  return (
    <View style={styles.card}>
      <View style={styles.texts}>
        <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>Código de invitación</Text>
        <Text selectable style={[typography.titleLarge, styles.code]}>{code}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Copiar código de invitación" onPress={() => void copy()} style={styles.copy}>
        <MaterialIcons name="content-copy" size={18} color={colors.primary} />
        <Text style={[typography.labelLarge, { color: colors.primary }]}>Copiar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.xxl,
    backgroundColor: colors.surfaceContainer,
  },
  texts: { flex: 1 },
  code: { color: colors.onSurface, letterSpacing: 2 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 8 },
});
