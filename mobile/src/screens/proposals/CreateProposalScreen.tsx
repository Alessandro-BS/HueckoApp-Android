import { MaterialIcons } from '@expo/vector-icons';
import type { PlanCategory, TimeWindowInput } from '@hueckoapp/shared';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createProposal } from '../../api/proposals';
import { ChoiceChip, DateTimeField, ErrorBanner, PrimaryButton, SecondaryButton, TextField, WeekSelector } from '../../components';
import { features } from '../../config';
import { useAction } from '../../hooks/useAction';
import { useCurrentLocation } from '../../hooks/useCurrentLocation';
import { useProposalDraft } from '../../hooks/useProposalDraft';
import type { AppStackScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { prefillFromDraft, prefillWindows, type ProposalPrefill } from '../../utils/ai';
import { today } from '../../utils/clock';
import { windowLabel } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { weekOptions } from '../../utils/zone';
import { AiDraftCard } from './AiDraftCard';
import { PlacePickerModal, type PickedPlace } from './PlacePickerModal';
import { WindowEditor } from './WindowEditor';

const MIN_WINDOWS = 2;
const MAX_WINDOWS = 5;
export const DEADLINE_AFTER_WINDOW = 'La votación debe cerrar antes de la primera franja';

type Coords = { latitude: number; longitude: number };

function FieldLabel({ children }: { children: string }) {
  return <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{children}</Text>;
}

export function CreateProposalScreen({ navigation, route }: AppStackScreen<'CreateProposal'>) {
  const { groupId, groupName, prefill } = route.params;
  const [now] = useState(today);
  const [week, setWeek] = useState(() => weekOptions(now)[0].week);
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [placeName, setPlaceName] = useState(prefill?.placeName ?? '');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(prefill?.votingDeadline ? new Date(prefill.votingDeadline) : null);
  const [windows, setWindows] = useState<TimeWindowInput[]>(prefill ? prefillWindows(prefill) : []);
  const [auto, setAuto] = useState(windows.length === 0);
  const [category, setCategory] = useState<PlanCategory | null>(prefill?.category ?? null);
  // La IA no eligió franja: se avisa en «Franjas» (el formulario queda en «las 3 mejores», que da 409 si no hay huecos).
  const [noWindow, setNoWindow] = useState(Boolean(prefill && windows.length === 0));
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const location = useCurrentLocation();
  const save = useAction(createProposal);
  const draft = useProposalDraft(groupId);

  const deadlineError = deadline && deadline.getTime() <= now.getTime() ? 'La fecha límite debe ser futura' : undefined;
  // El plazo debe ser anterior al inicio de la primera franja (el servidor responde 400 si no).
  const firstStart = windows.reduce<number | null>((min, w) => {
    const start = new Date(`${w.date}T${w.startTime}:00-05:00`).getTime();
    return min === null || start < min ? start : min;
  }, null);
  const afterWindow = !auto && deadline !== null && firstStart !== null && deadline.getTime() >= firstStart;
  const windowCountOk = auto || (windows.length >= MIN_WINDOWS && windows.length <= MAX_WINDOWS);
  const formValid =
    title.trim().length > 0 && deadline !== null && !deadlineError && !afterWindow && windowCountOk;

  // Escribir el lugar a mano descarta las coordenadas de «Usar mi ubicación actual».
  const changePlace = (text: string) => {
    setPlaceName(text);
    setCoords(null);
    location.clearError();
  };

  // «Elegir en el mapa»: para un plan que no es donde está el usuario. Abre sobre el lugar ya elegido, si tiene coordenadas.
  const [mapOpen, setMapOpen] = useState(false);
  const pickOnMap = (place: PickedPlace) => {
    setMapOpen(false);
    setPlaceName(place.name);
    setCoords({ latitude: place.latitude, longitude: place.longitude });
    location.clearError();
  };

  const fillWithMyLocation = async () => {
    const found = await location.locate();
    if (!found) return;
    setPlaceName(found.name);
    setCoords(found.latitude !== null && found.longitude !== null ? { latitude: found.latitude, longitude: found.longitude } : null);
  };

  // Un borrador de la IA reemplaza lo que hubiera en el formulario; el usuario lo revisa antes de crear.
  const applyPrefill = (p: ProposalPrefill) => {
    setTitle(p.title);
    setPlaceName(p.placeName ?? '');
    setCoords(null);
    location.clearError();
    setDeadline(p.votingDeadline ? new Date(p.votingDeadline) : null);
    const options = prefillWindows(p);
    setAuto(options.length === 0);
    setWindows(options);
    setCategory(p.category);
    setNoWindow(options.length === 0);
  };

  const generateDraft = async (text: string) => {
    const result = await draft.generate(text);
    if (!result || !mounted.current) return;
    applyPrefill(prefillFromDraft(result));
    showToast('Borrador listo: revísalo antes de crear la propuesta.');
  };

  const submit = async () => {
    if (!formValid || !deadline) return;
    const name = placeName.trim();
    const result = await save.run(groupId, {
      title: title.trim(),
      location: name ? { name, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null } : null,
      votingDeadline: deadline.toISOString(),
      ...(auto ? { windows: [], week } : { windows }),
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

        <AiDraftCard
          generating={draft.generating}
          error={draft.error}
          onGenerate={(text) => void generateDraft(text)}
          category={category}
        />

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
          {features.mapPicker ? (
            <SecondaryButton title="Elegir en el mapa" icon="map" onPress={() => setMapOpen(true)} />
          ) : (
            <SecondaryButton title="Elegir en el mapa (en curso)" icon="map" disabled onPress={() => undefined} />
          )}
          {location.error ? <ErrorBanner message={location.error} /> : null}
          {location.canOpenSettings ? <SecondaryButton title="Abrir ajustes" icon="settings" onPress={() => void Linking.openSettings()} /> : null}
        </View>

        <DateTimeField
          label="Fecha límite de votación"
          value={deadline}
          onChange={setDeadline}
          minimumDate={now}
          placeholder="Elige fecha y hora"
          error={deadlineError ?? (afterWindow ? DEADLINE_AFTER_WINDOW : undefined)}
          helperText="Después de esta hora ya no se puede votar."
        />

        <View style={styles.section}>
          <FieldLabel>Semana</FieldLabel>
          <WeekSelector value={week} onChange={setWeek} now={now} />
          <FieldLabel>Franjas horarias</FieldLabel>
          <View style={styles.options}>
            <ChoiceChip label="Que Huecko proponga las 3 mejores" selected={auto} onPress={() => setAuto(true)} />
            <ChoiceChip label="Elegir yo las franjas" selected={!auto} onPress={() => setAuto(false)} />
          </View>
          {noWindow ? (
            <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
              Huecko IA no eligió franja: añade una a mano (o deja que Huecko elija si el grupo tiene huecos en común).
            </Text>
          ) : null}
          {auto ? (
            <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
              Huecko elegirá las 3 franjas en las que más gente del grupo está libre.
            </Text>
          ) : (
            <>
              {windows.map((w) => (
                <View key={`${w.date}-${w.startTime}-${w.endTime}`} style={styles.windowRow}>
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
              {windows.length < MAX_WINDOWS ? (
                <WindowEditor
                  variant="secondary"
                  week={week}
                  now={now}
                  submitLabel="Añadir franja"
                  existing={windows}
                  onSubmit={(w) => setWindows((prev) => [...prev, w])}
                />
              ) : (
                <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
                  Ya tienes {MAX_WINDOWS} franjas: quita una para añadir otra.
                </Text>
              )}
              {!windowCountOk ? (
                <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
                  Elige entre {MIN_WINDOWS} y {MAX_WINDOWS} franjas
                </Text>
              ) : null}
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
      {mapOpen ? (
        <PlacePickerModal
          initial={coords ? { name: placeName.trim(), ...coords } : null}
          onPick={pickOnMap}
          onDismiss={() => setMapOpen(false)}
        />
      ) : null}
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
