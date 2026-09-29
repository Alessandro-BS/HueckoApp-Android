import { View } from 'react-native';

import { EmptyState } from '../../../components';
import { colors } from '../../../theme';

type Props = {
  /** Lo usará la Fase 3 para cargar las propuestas del grupo. */
  groupId: string;
};

// Se reemplaza en la Fase 3 (propuestas y votación).
export function PlansTab(_props: Props) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.surface }}>
      <EmptyState
        title="Todavía no hay planes"
        description="Las propuestas de planes y las votaciones llegan en la Fase 3."
        icon="event-note"
      />
    </View>
  );
}
