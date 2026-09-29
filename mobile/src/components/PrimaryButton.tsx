import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, typography } from '../theme';
import type { IconName } from './icons';

type Props = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  loadingTitle?: string;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
};

const DISABLED_BG = 'rgba(29,27,32,0.12)';
const DISABLED_FG = 'rgba(29,27,32,0.38)';

export function PrimaryButton({ title, onPress, icon, disabled = false, loading = false, loadingTitle, size = 'md', style }: Props) {
  const blocked = disabled || loading;
  const fg = disabled ? DISABLED_FG : colors.onPrimary;
  const textStyle = size === 'lg' ? typography.labelLarge : typography.labelMedium;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={[styles.button, { height: size === 'lg' ? 52 : 48, backgroundColor: disabled ? DISABLED_BG : colors.primary }, style]}
    >
      <View style={styles.row}>
        {loading ? (
          <>
            <ActivityIndicator size={18} color={colors.onPrimary} />
            <View style={{ width: 10 }} />
          </>
        ) : icon ? (
          <>
            <MaterialIcons name={icon} size={18} color={fg} />
            <View style={{ width: 8 }} />
          </>
        ) : null}
        <Text numberOfLines={1} style={[textStyle, { color: fg }]}>
          {loading ? (loadingTitle ?? title) : title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: radius.xxl, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
