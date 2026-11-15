import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, typography } from '../theme';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Segunda línea (p. ej. nº de bloques del día). */
  caption?: string;
  /** 'title' para chips de día (titleSmall); 'label' para opciones (labelMedium). */
  variant?: 'label' | 'title';
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Botón de elección: relleno primary si está elegido, surfaceContainer si no (UI spec §2.10 y §3.8).
export function ChoiceChip({ label, selected, onPress, caption, variant = 'label', accessibilityLabel, disabled = false, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceContainer }, disabled && styles.disabled, style]}
    >
      <Text
        numberOfLines={1}
        style={[variant === 'title' ? typography.titleSmall : typography.labelMedium, { color: selected ? colors.onPrimary : colors.onSurface }]}
      >
        {label}
      </Text>
      {caption !== undefined ? (
        <Text numberOfLines={1} style={[typography.bodySmall, { color: selected ? colors.onPrimary : colors.onSurfaceVariant }]}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.38 },
  chip: {
    minHeight: 48,
    borderRadius: radius.xxl,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
