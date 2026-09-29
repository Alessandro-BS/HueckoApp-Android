import type { TimeBlock } from '@hueckoapp/shared';
import { useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { DaySelector, EmptyState, LoadState, PrimaryButton, SecondaryButton, TimeBlockItem } from '../../components';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import { useSchedule } from '../../hooks/useSchedule';
import type { DrawerScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { blocksForDay, dayShort, formatShortDate, isoDayOf, laterPunctualBlocks } from '../../utils/days';
import { pickScheduleImage, type ImageSource } from '../../utils/scheduleImage';
import { showToast } from '../../utils/toast';

export function MyScheduleScreen({ navigation }: DrawerScreen<'Schedule'>) {
  const { blocks, loaded, loading, refreshing, error, reload, removeBlock } = useSchedule();
  useRefreshOnFocus(reload);
  const now = today();
  // Arranca en el día de hoy, no en lunes (UI spec §6, quirk 18).
  const [selectedDay, setSelectedDay] = useState(() => isoDayOf(today()));
  const dayBlocks = blocksForDay(blocks, selectedDay, now);
  // Los puntuales de semanas posteriores no caben en el selector de días: se listan aparte.
  const laterBlocks = laterPunctualBlocks(blocks, now);

  const addBlock = () => navigation.navigate('AddSchedule', { initialDay: selectedDay });

  const deleteBlock = async (block: TimeBlock) => {
    try {
      await removeBlock(block.id);
      showToast('Bloque eliminado.');
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  // En Kotlin se borraba sin preguntar (quirk 15).
  const confirmDelete = (block: TimeBlock) =>
    Alert.alert('Eliminar bloque', `¿Seguro que quieres eliminar «${block.label}» de tu horario?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void deleteBlock(block) },
    ]);

  // «Escanear» (UI spec §1.4): foto → OcrReview. Cancelar el selector no hace nada.
  const scan = async (source: ImageSource) => {
    const result = await pickScheduleImage(source);
    if (result.kind === 'picked') {
      navigation.navigate('OcrReview', { image: result.image });
    } else if (result.kind === 'error') {
      if (result.canOpenSettings) {
        Alert.alert('Escanear horario', result.message, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
        ]);
      } else {
        showToast(result.message);
      }
    }
  };

  const chooseScanSource = () =>
    Alert.alert(
      'Escanear horario',
      'Toma una foto de tu horario o elige una de la galería. Huecko IA leerá los bloques y podrás revisarlos antes de guardarlos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Galería', onPress: () => void scan('gallery') },
        { text: 'Cámara', onPress: () => void scan('camera') },
      ],
    );

  const captionFor = (iso: number) => {
    const count = blocksForDay(blocks, iso, now).length;
    return count === 0 ? 'libre' : String(count);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <View>
        <Text style={[typography.headlineLarge, { color: colors.onSurface }]}>Mi horario</Text>
        <Text style={[typography.bodyMedium, styles.subtitle]}>
          Registra tus clases y turnos. Lo que no esté aquí cuenta como hueco libre para tus grupos.
        </Text>
        <View style={styles.actions}>
          <SecondaryButton title="Escanear" icon="document-scanner" style={styles.flex} onPress={chooseScanSource} />
          <PrimaryButton title="Añadir bloque" icon="add" style={styles.flex} onPress={addBlock} />
        </View>
      </View>
      <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
        {blocks.length === 0 ? (
          <EmptyState
            title="Aún no tienes horarios registrados"
            description="Añade tus clases, trabajo o actividades para que tus grupos encuentren los mejores huecos."
            icon="calendar-today"
            actionLabel="Añadir mi primer bloque"
            onAction={addBlock}
          />
        ) : (
          <>
            <DaySelector selected={selectedDay} onSelect={setSelectedDay} captionFor={captionFor} />
            {dayBlocks.length === 0 ? (
              <EmptyState
                title={`Sin bloques el ${dayShort(selectedDay)}`}
                description="Todo el día cuenta como libre para tus grupos."
                icon="event-available"
                actionLabel="Añadir un bloque"
                onAction={addBlock}
              />
            ) : (
              dayBlocks.map((block) => <TimeBlockItem key={block.id} block={block} onDelete={() => confirmDelete(block)} />)
            )}
            {laterBlocks.length > 0 ? (
              <View style={styles.later}>
                <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Próximos bloques puntuales</Text>
                {laterBlocks.map((block) => (
                  <View key={block.id} style={styles.laterRow}>
                    <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{formatShortDate(block.date!)}</Text>
                    <TimeBlockItem block={block} onDelete={() => confirmDelete(block)} />
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  later: { gap: 12 },
  laterRow: { gap: 6 },
});
