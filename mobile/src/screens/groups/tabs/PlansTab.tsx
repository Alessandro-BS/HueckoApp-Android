import { View } from 'react-native';

import { EmptyState } from '../../../components';
import { colors } from '../../../theme';

// Se reemplaza en la Fase 3 (propuestas y votación).
export function PlansTab() {
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
