import { ScrollView, StyleSheet } from 'react-native';

import { today } from '../utils/clock';
import { weekOptions } from '../utils/zone';
import { ChoiceChip } from './ChoiceChip';

type Props = {
  /** Lunes «YYYY-MM-DD» de la semana elegida. */
  value: string;
  onChange: (week: string) => void;
  /** Solo para tests: por defecto, el reloj real. */
  now?: Date;
};

// Semana a planear: la actual y las 3 siguientes, identificadas por su lunes (hora de Lima).
export function WeekSelector({ value, onChange, now = today() }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {weekOptions(now).map((option) => (
        <ChoiceChip key={option.week} label={option.label} selected={option.week === value} onPress={() => onChange(option.week)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
});
