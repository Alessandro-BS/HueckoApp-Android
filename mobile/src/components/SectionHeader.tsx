import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';

type Props = { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void };

export function SectionHeader({ title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text style={[typography.titleLarge, { color: colors.onSurface }]}>{title}</Text>
        {subtitle ? <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <>
          <View style={{ width: 8 }} />
          <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}>
            <Text style={[typography.labelMedium, { color: colors.primary }]}>{actionLabel}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  texts: { flex: 1 },
  action: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
});
