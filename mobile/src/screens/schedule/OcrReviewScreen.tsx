import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '../../components';
import { useScheduleOcr } from '../../hooks/useScheduleOcr';
import type { AppStackScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { savedBlocksMessage } from '../../utils/ai';
import { showToast } from '../../utils/toast';
import { OcrBlocksEditor } from './OcrBlocksEditor';

type NoticeProps = { tone: 'error' | 'neutral'; title: string; message: string; onBack: () => void; onRetry?: () => void };

// CenteredNotice (UI spec §2.11).
function OcrNotice({ tone, title, message, onBack, onRetry }: NoticeProps) {
  const error = tone === 'error';
  return (
    <View style={styles.centered}>
      <View style={[styles.notice, { backgroundColor: error ? colors.errorContainer : colors.surfaceContainer }]}>
        <MaterialIcons name="error-outline" size={28} color={error ? colors.onErrorContainer : colors.onSurfaceVariant} />
        <Text style={[typography.titleMedium, styles.center, { color: error ? colors.onErrorContainer : colors.onSurface }]}>{title}</Text>
        <Text style={[typography.bodyMedium, styles.center, { color: error ? colors.onErrorContainer : colors.onSurfaceVariant }]}>{message}</Text>
        <View style={styles.noticeActions}>
          {onRetry ? <SecondaryButton title="Reintentar" icon="refresh" onPress={onRetry} /> : null}
          <PrimaryButton title="Volver" onPress={onBack} />
        </View>
      </View>
    </View>
  );
}

// Revisar escaneo (UI spec §2.11): la IA lee la foto al abrir; el usuario corrige y guarda.
export function OcrReviewScreen({ navigation, route }: AppStackScreen<'OcrReview'>) {
  const { image } = route.params;
  const { blocks, loading, error, retry } = useScheduleOcr(image);
  const back = () => navigation.goBack();

  if (loading && !blocks) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[typography.titleMedium, styles.center, { color: colors.onSurface, marginTop: 20 }]}>Leyendo tu horario</Text>
        <Text style={[typography.bodyMedium, styles.center, { color: colors.onSurfaceVariant, marginTop: 6 }]}>
          Puede tardar unos segundos. No cierres la pantalla.
        </Text>
      </View>
    );
  }
  if (error && !blocks) {
    return <OcrNotice tone="error" title="No se pudo leer el horario" message={error} onBack={back} onRetry={() => void retry()} />;
  }
  if (!blocks || blocks.length === 0) {
    return (
      <OcrNotice
        tone="neutral"
        title="No se detectó ningún bloque"
        message="Prueba con una foto más nítida o añade los bloques a mano."
        onBack={back}
      />
    );
  }
  return (
    <OcrBlocksEditor
      initial={blocks}
      onDiscard={back}
      onSaved={(count) => {
        showToast(savedBlocksMessage(count));
        // «Mi horario» está debajo y recarga al volver a enfocarse (useRefreshOnFocus).
        navigation.goBack();
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.surface },
  center: { textAlign: 'center' },
  notice: { borderRadius: 24, padding: 24, alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  noticeActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
