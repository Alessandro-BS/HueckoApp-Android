import { MaterialIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner, PrimaryButton, SecondaryButton, TextField } from '../../components';
import { OsmMap, PIN_ZOOM, type LatLng, type OsmMapHandle } from '../../components/OsmMap';
import { usePlaceLookup } from '../../hooks/usePlaceLookup';
import { colors, typography } from '../../theme';

export type PickedPlace = { name: string; latitude: number; longitude: number };

type Props = {
  /** Lugar ya elegido (para abrir el mapa sobre él); null abre en Lima. */
  initial: PickedPlace | null;
  onPick: (place: PickedPlace) => void;
  onDismiss: () => void;
};

// Centro de Lima: punto de partida cuando todavía no hay lugar.
const LIMA = { latitude: -12.0464, longitude: -77.0428 };
const CITY_ZOOM = 12;

// Elegir el lugar de un plan en un mapa de OpenStreetMap (OsmMap): buscando una dirección, tocando el mapa o
// arrastrando el pin. Complementa a «Usar mi ubicación actual» cuando el plan no es donde está el usuario.
export function PlacePickerModal({ initial, onPick, onDismiss }: Props) {
  const lookup = usePlaceLookup();
  const map = useRef<OsmMapHandle>(null);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<PickedPlace | null>(initial);
  const [naming, setNaming] = useState(false);
  // Cada toque o arrastre pide un nombre; si llegan desordenados, solo vale el del último punto.
  const lastRequest = useRef(0);

  const pinAt = async (latitude: number, longitude: number) => {
    const request = ++lastRequest.current;
    lookup.clearError();
    setPlace({ name: '', latitude, longitude });
    setNaming(true);
    const name = await lookup.nameAt(latitude, longitude);
    if (request !== lastRequest.current) return;
    setPlace({ name, latitude, longitude });
    setNaming(false);
  };

  const onPoint = (p: LatLng) => void pinAt(p.latitude, p.longitude);

  const search = async () => {
    const found = await lookup.search(query);
    if (!found) return;
    lastRequest.current++; // descarta un nombre pendiente de un toque anterior
    setNaming(false);
    setPlace(found);
    map.current?.animateTo(found);
  };

  const ready = place !== null && !naming && place.name.length > 0;

  return (
    <Modal visible animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onDismiss} style={styles.iconButton}>
            <MaterialIcons name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={[typography.titleLarge, { color: colors.onSurface }]}>Elegir lugar</Text>
        </View>

        <View style={styles.search}>
          <View style={styles.flex}>
            <TextField
              accessibilityLabel="Buscar dirección o lugar"
              value={query}
              onChangeText={setQuery}
              placeholder="Biblioteca Central, Av. Universitaria…"
              leadingIcon="search"
              maxLength={100}
              returnKeyType="search"
              onSubmitEditing={() => void search()}
            />
          </View>
          <SecondaryButton title="Buscar" disabled={lookup.searching || !query.trim()} onPress={() => void search()} />
        </View>
        {lookup.error ? (
          <View style={styles.padded}>
            <ErrorBanner message={lookup.error} />
          </View>
        ) : null}

        <OsmMap
          ref={map}
          style={styles.flex}
          initialCenter={initial ?? LIMA}
          initialZoom={initial ? PIN_ZOOM : CITY_ZOOM}
          marker={place}
          onPress={onPoint}
          onMarkerDragEnd={onPoint}
        />

        <View style={styles.footer}>
          {place ? (
            <View style={styles.placeRow}>
              <MaterialIcons name="place" size={20} color={colors.primary} />
              {naming ? <ActivityIndicator color={colors.primary} /> : null}
              <Text style={[typography.bodyLarge, styles.flex, { color: colors.onSurface }]} numberOfLines={2}>
                {naming ? 'Buscando la dirección…' : place.name}
              </Text>
            </View>
          ) : (
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
              Busca una dirección o toca el mapa para marcar el lugar. Después puedes arrastrar el pin para ajustarlo.
            </Text>
          )}
          <PrimaryButton title="Usar este lugar" disabled={!ready} onPress={() => place && onPick(place)} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 4 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  padded: { paddingHorizontal: 16, paddingBottom: 12 },
  footer: { padding: 16, gap: 12, backgroundColor: colors.surface },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
