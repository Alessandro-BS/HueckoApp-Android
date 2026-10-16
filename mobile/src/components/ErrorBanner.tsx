import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../theme';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <MaterialIcons name="error-outline" size={18} color={colors.onErrorContainer} />
      <Text style={[typography.bodySmall, styles.text]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.xxl,
    backgroundColor: colors.errorContainer,
  },
  text: { flex: 1, color: colors.onErrorContainer },
});
