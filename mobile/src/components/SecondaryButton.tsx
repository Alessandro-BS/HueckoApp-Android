import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, typography } from '../theme';
import type { IconName } from './icons';

type Props = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  color?: string;
};

export function SecondaryButton({ title, onPress, icon, style, color }: Props) {
  const tint = color ?? colors.primary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, { borderColor: color ?? colors.outline }, style]}>
      <View style={styles.row}>
        {icon ? (
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
