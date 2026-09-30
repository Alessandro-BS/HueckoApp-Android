import { MaterialIcons } from '@expo/vector-icons';
import type { PlanCategory } from '@hueckoapp/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AiDemoHint, ErrorBanner, HueckoCard, SecondaryButton, TextField } from '../../components';
import { colors, typography } from '../../theme';
import { CATEGORY_LABEL } from '../../utils/ai';

type Props = {
  generating: boolean;
  error: string | null;
  onGenerate: (text: string) => void;
  /** Categoría del último borrador o idea aplicada (no se guarda en la propuesta, D6). */
  category: PlanCategory | null;
};

// «Redactar con Huecko IA» (arriba de Nueva propuesta): una frase → formulario rellenado.
export function AiDraftCard({ generating, error, onGenerate, category }: Props) {
  const [text, setText] = useState('');
  const valid = text.trim().length >= 3;

  const submit = () => {
    if (!valid || generating) return;
    onGenerate(text.trim());
  };

  return (
    <HueckoCard containerColor={colors.primaryContainer} borderColor={colors.primaryContainer} padding={16} style={styles.card}>
      <View style={styles.header}>
        <MaterialIcons name="auto-awesome" size={20} color={colors.onPrimaryContainer} />
        <Text style={[typography.titleSmall, styles.onContainer]}>Redactar con Huecko IA</Text>
      </View>
      <Text style={[typography.bodySmall, styles.onContainer]}>
        Cuenta el plan con tus palabras y Huecko IA rellenará el formulario con un hueco real del grupo. Revísalo antes de crear.
      </Text>
      <TextField
        label="Describe tu plan"
        value={text}
        onChangeText={setText}
        placeholder="Estudiar para el parcial el jueves en la tarde, en la biblioteca"
        multiline
        maxLength={500}
        autoCapitalize="sentences"
      />
      <SecondaryButton
        title={generating ? 'Pensando…' : 'Rellenar con IA'}
        icon="auto-awesome"
        disabled={!valid || generating}
        onPress={submit}
      />
      {error ? <ErrorBanner message={error} /> : null}
      {category ? (
        <>
          <Text style={[typography.labelMedium, styles.onContainer]}>{`Categoría sugerida: ${CATEGORY_LABEL[category]}`}</Text>
          <AiDemoHint />
        </>
      ) : null}
    </HueckoCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onContainer: { color: colors.onPrimaryContainer },
});
