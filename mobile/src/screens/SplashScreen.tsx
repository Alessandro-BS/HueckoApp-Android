import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Text style={styles.letter}>H</Text>
      </View>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, backgroundColor: colors.background },
  mark: { width: 52, height: 52, borderRadius: radius.xxl, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 26, fontWeight: '700', color: colors.onPrimary },
});
