import { StyleSheet, Text, View } from 'react-native';

import { radius, typography } from '../theme';

type Props = { text: string; containerColor: string; contentColor: string };

export function Badge({ text, containerColor, contentColor }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: containerColor }]}>
      <Text style={[typography.labelMedium, { color: contentColor }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: radius.lg, paddingHorizontal: 8, paddingVertical: 4 },
});
