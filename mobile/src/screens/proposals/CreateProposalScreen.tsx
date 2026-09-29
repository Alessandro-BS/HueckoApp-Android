import { MaterialIcons } from '@expo/vector-icons';
import type { TimeWindowInput } from '@hueckoapp/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createProposal } from '../../api/proposals';
import { ChoiceChip, DateTimeField, ErrorBanner, PrimaryButton, SecondaryButton, TextField } from '../../components';
import { useAction } from '../../hooks/useAction';
import { useCurrentLocation } from '../../hooks/useCurrentLocation';
import type { AppStackScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { windowLabel } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { WindowEditor } from './WindowEditor';

type Coords = { latitude: number; longitude: number };

function FieldLabel({ children }: { children: string }) {
  return <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{children}</Text>;
}

export function CreateProposalScreen({ navigation, route }: AppStackScreen<'CreateProposal'>) {
  const { groupId, groupName } = route.params;
  const [now] = useState(today);
  const [title, setTitle] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [auto, setAuto] = useState(true);
  const [windows, setWindows] = useState<TimeWindowInput[]>([]);
  const location = useCurrentLocation();
  const save = useAction(createProposal);

  const deadlineError = deadline && deadline.getTime() <= now.getTime() ? 'La fecha límite debe ser futura' : undefined;
  const formValid = title.trim().length > 0 && deadline !== null && !deadlineError && (auto || windows.length > 0);

  // Escribir el lugar a mano descarta las coordenadas de «Usar mi ubicación actual».
  const changePlace = (text: string) => {
    setPlaceName(text);
    setCoords(null);
    location.clearError();
  };

  const fillWithMyLocation = async () => {
    const found = await location.locate();
    if (!found) return;
    setPlaceName(found.name);
    setCoords(found.latitude !== null && found.longitude !== null ? { latitude: found.latitude, longitude: found.longitude } : null);
  };

  const submit = async () => {
    if (!formValid || !deadline) return;
    const name = placeName.trim();
    const result = await save.run(groupId, {
      title: title.trim(),
      location: name ? { name, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null } : null,
      votingDeadline: deadline.toISOString(),
      windows: auto ? [] : windows,
    });
    if (result.ok) {
      showToast('Propuesta creada.');
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{`Para «${groupName}»`}</Text>

        <TextField
          label="Título del plan"
          value={title}
          onChangeText={setTitle}
          placeholder="Repaso antes de la entrega"
          maxLength={80}
          autoCapitalize="sentences"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />

        <View style={styles.section}>
          <TextField
            label="Lugar (opcional)"
            value={placeName}
            onChangeText={changePlace}
            placeholder="Biblioteca central"
            leadingIcon="place"
            maxLength={100}
            autoCapitalize="sentences"
            helperText={coords ? 'Con coordenadas: se podrá abrir en el mapa.' : undefined}
          />
          <SecondaryButton
            title={location.locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación actual'}
            icon="my-location"
            disabled={location.locating}
            onPress={() => void fillWithMyLocation()}
          />
          {location.error ? <ErrorBanner message={location.error} /> : null}
          {location.canOpenSettings ? <SecondaryButton title="Abrir ajustes" icon="settings" onPress={() => void Linking.openSettings()} /> : null}
        </View>

        <DateTimeField
          label="Fecha límite de votación"
          value={deadline}
          onChange={setDeadline}
          minimumDate={now}
          placeholder="Elige fecha y hora"
          error={deadlineError}
          helperText="Después de esta hora ya no se puede votar."
        />

        <View style={styles.section}>
          <FieldLabel>Franjas horarias</FieldLabel>
          <View style={styles.options}>
            <ChoiceChip label="Que Huecko proponga las 3 mejores" selected={auto} onPress={() => setAuto(true)} />
            <ChoiceChip label="Elegir yo las franjas" selected={!auto} onPress={() => setAuto(false)} />
          </View>
          {auto ? (
            <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
              Huecko elegirá las 3 franjas en las que más gente del grupo está libre.
            </Text>
          ) : (
            <>
              {windows.map((w) => (
                <View key={`${w.dayOfWeek}-${w.startTime}-${w.endTime}`} style={styles.windowRow}>
                  <Text style={[typography.titleSmall, styles.flex, { color: colors.onSurface }]}>{windowLabel(w)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${windowLabel(w)}`}
                    onPress={() => setWindows((prev) => prev.filter((x) => x !== w))}
                    style={styles.iconButton}
                  >
                    <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
              ))}
              <WindowEditor
                variant="secondary"
                submitLabel="Añadir franja"
                existing={windows}
                onSubmit={(w) => setWindows((prev) => [...prev, w])}
              />
            </>
          )}
        </View>

        {save.error ? <ErrorBanner message={save.error} /> : null}
        <PrimaryButton
          title="Crear propuesta"
          loadingTitle="Creando…"
          loading={save.loading}
          disabled={!formValid}
          onPress={() => void submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  section: { gap: 8 },
  options: { gap: 8 },
  windowRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderRadius: 12, backgroundColor: colors.surfaceContainer },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
