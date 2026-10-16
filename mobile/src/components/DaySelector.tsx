import { ScrollView, StyleSheet } from 'react-native';

import { dayLong, dayShort, WEEK_DAYS } from '../utils/days';
import { ChoiceChip } from './ChoiceChip';

type Props = {
  selected: number;
  onSelect: (iso: number) => void;
  captionFor: (iso: number) => string;
  /** Etiqueta de accesibilidad de cada chip (p. ej. cuando hay varios selectores en pantalla). */
  chipLabel?: (iso: number) => string;
};

// HueckoDaySelector (UI spec §3.8): 7 chips Lun…Dom con una segunda línea por día.
export function DaySelector({ selected, onSelect, captionFor, chipLabel }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {WEEK_DAYS.map((iso) => {
        const caption = captionFor(iso);
        return (
          <ChoiceChip
            key={iso}
            variant="title"
            label={dayShort(iso)}
            caption={caption || undefined}
            accessibilityLabel={chipLabel ? chipLabel(iso) : caption ? `${dayLong(iso)}, ${caption}` : dayLong(iso)}
            selected={iso === selected}
            onPress={() => onSelect(iso)}
            style={styles.chip}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  chip: { minWidth: 64, minHeight: 56, paddingHorizontal: 10 },
});
