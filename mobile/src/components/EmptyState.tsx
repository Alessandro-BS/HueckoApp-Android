import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';
import type { IconName } from './icons';

type Props = {
  title: string;
  description: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, description, icon = 'inbox', actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.circle}>
        <MaterialIcons name={icon} size={48} color={colors.primary} />
      </View>
      <Text style={[typography.titleLarge, styles.title]}>{title}</Text>
      <Text style={[typography.bodyMedium, styles.description]}>{description}</Text>
      {actionLabel ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}>
          <Text style={[typography.labelLarge, { color: colors.onPrimary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: 32 },
  circle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryContainer + '80',
  },
  title: { marginTop: 24, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  description: { marginTop: 8, color: colors.onSurfaceVariant, textAlign: 'center' },
  action: {
    marginTop: 24,
    height: 40,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
