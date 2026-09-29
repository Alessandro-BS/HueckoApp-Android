import { View } from 'react-native';

import { EmptyState, type IconName } from '../components';
import { colors } from '../theme';

export function PlaceholderScreen({ title, icon }: { title: string; icon: IconName }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.surface }}>
      <EmptyState title={title} icon={icon} description="Esta sección llega en la próxima fase de la migración." />
    </View>
  );
}
