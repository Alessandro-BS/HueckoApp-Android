import { StyleSheet, Text, View } from 'react-native';

import { typography } from '../theme';

type Props = { name: string; color: string; size?: number };

export function Avatar({ name, color, size = 32 }: Props) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}
    >
      <Text style={[typography.labelMedium, styles.text]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF' },
});
