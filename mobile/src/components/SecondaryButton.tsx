import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, typography } from '../theme';
import type { IconName } from './icons';

type Props = {
  title: string;
  onPress: () => void;
  /** Nombre para el lector de pantalla si el título solo no basta (p. ej. varios «Usar» en una lista). */
  accessibilityLabel?: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  color?: string;
  disabled?: boolean;
  /** En curso: indicador en lugar del icono y no se puede pulsar (como PrimaryButton). */
  loading?: boolean;
};

export function SecondaryButton({ title, onPress, accessibilityLabel, icon, style, color, disabled = false, loading = false }: Props) {
  const blocked = disabled || loading;
  const tint = disabled ? colors.disabledContent : (color ?? colors.primary);
  const border = disabled ? colors.disabledContainer : (color ?? colors.outline);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={[styles.button, { borderColor: border }, style]}
    >
      <View style={styles.row}>
        {loading ? (
          <>
            <ActivityIndicator size={18} color={tint} />
            <View style={{ width: 8 }} />
          </>
        ) : icon ? (
          <>
            <MaterialIcons name={icon} size={18} color={tint} />
            <View style={{ width: 8 }} />
          </>
        ) : null}
        <Text numberOfLines={1} style={[typography.labelMedium, { color: tint }]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: radius.xxl,
    borderWidth: 1,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
