import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { ErrorBanner } from './ErrorBanner';
import { SecondaryButton } from './SecondaryButton';

type Props = {
  loading: boolean;
  error: string | null;
  /** Si ya hay datos que mostrar, una recarga o un error no los ocultan. */
  hasData: boolean;
  onRetry: () => void;
  children: ReactNode;
};

// Escalera común de carga → error con reintento → contenido, para las pantallas que leen de la API.
export function LoadState({ loading, error, hasData, onRetry, children }: Props) {
  if (loading && !hasData) return <ActivityIndicator accessibilityLabel="Cargando" color={colors.primary} style={styles.spinner} />;
  if (error && !hasData) {
    return (
      <View style={styles.errorBox}>
        <ErrorBanner message={error} />
        <SecondaryButton title="Reintentar" icon="refresh" onPress={onRetry} />
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  spinner: { marginTop: 32 },
  errorBox: { gap: 12 },
});
