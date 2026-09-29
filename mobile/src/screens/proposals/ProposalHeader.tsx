import { MaterialIcons } from '@expo/vector-icons';
import type { Proposal } from '@hueckoapp/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HueckoCard, ProposalStateBadge } from '../../components';
import { colors, typography } from '../../theme';
import { openInMaps } from '../../utils/location';
import { deadlineLabel, scheduleLabel } from '../../utils/proposals';

type Props = { proposal: Proposal; now: Date; /** Detalle del plan: quién lo creó y «Abrir en el mapa». */ details?: boolean };

export function ProposalHeader({ proposal, now, details = false }: Props) {
  const place = proposal.location;
  const mappable =
    place && place.latitude !== null && place.longitude !== null
      ? { name: place.name, latitude: place.latitude, longitude: place.longitude }
      : null;
  const schedule = scheduleLabel(proposal);

  return (
    <HueckoCard containerColor={colors.primaryContainer} borderColor={colors.primaryContainer}>
      <Text style={[typography.headlineSmall, styles.text]}>{proposal.title}</Text>
      {place ? (
        <View style={styles.place}>
          <MaterialIcons name="place" size={16} color={colors.onPrimaryContainer} />
          <Text style={[typography.bodyMedium, styles.text, styles.flex]}>{place.name}</Text>
        </View>
      ) : null}
      {details && mappable ? (
        <Pressable accessibilityRole="button" onPress={() => void openInMaps(mappable)} style={styles.mapButton}>
          <MaterialIcons name="map" size={18} color={colors.primary} />
          <Text style={[typography.labelLarge, { color: colors.primary }]}>Abrir en el mapa</Text>
        </Pressable>
      ) : null}
      {details ? <Text style={[typography.bodySmall, styles.text, styles.line]}>{`Creado por: ${proposal.createdBy.name}`}</Text> : null}
      <Text style={[typography.bodySmall, styles.text, styles.line]}>{deadlineLabel(proposal.votingDeadline, now)}</Text>
      {schedule ? <Text style={[typography.bodySmall, styles.text, styles.line]}>{`Fecha: ${schedule}`}</Text> : null}
      <View style={styles.badge}>
        <ProposalStateBadge state={proposal.state} />
      </View>
    </HueckoCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  text: { color: colors.onPrimaryContainer },
  place: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  mapButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, marginTop: 4 },
  line: { marginTop: 4 },
  badge: { marginTop: 12 },
});
