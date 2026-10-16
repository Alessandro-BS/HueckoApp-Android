import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../theme';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  containerColor?: string;
  borderColor?: string;
  padding?: number;
};

export function HueckoCard({ children, onPress, style, containerColor, borderColor, padding = 20 }: Props) {
  const cardStyle = [
    styles.card,
    { backgroundColor: containerColor ?? colors.surfaceContainerLowest, borderColor: borderColor ?? colors.outlineVariant, padding },
    style,
  ];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} android_ripple={{ color: colors.primaryContainer }} style={cardStyle}>
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
});
