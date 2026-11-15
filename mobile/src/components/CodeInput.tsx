import { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '../theme';

const LENGTH = 6;

type Props = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
};

/** Código de 6 dígitos: un campo oculto (teclado numérico, autocompletar del SMS/correo) y 6 casillas visibles. */
export function CodeInput({ value, onChange, error, autoFocus }: Props) {
  const inputRef = useRef<TextInput>(null);
  const active = Math.min(value.length, LENGTH - 1);
  return (
    <View>
      <Pressable accessible={false} onPress={() => inputRef.current?.focus()} style={styles.row}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <View
            key={i}
            style={[styles.cell, { borderColor: error ? colors.error : i === active ? colors.primary : colors.outline }]}
          >
            <Text style={[typography.headlineMedium, { color: colors.onSurface }]}>{value[i] ?? ''}</Text>
          </View>
        ))}
        <TextInput
          ref={inputRef}
          accessibilityLabel="Código de 6 dígitos"
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, LENGTH))}
          keyboardType="number-pad"
          maxLength={LENGTH}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus={autoFocus}
          caretHidden
          style={styles.hidden}
        />
      </Pressable>
      {error ? <Text style={[typography.bodySmall, styles.error]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cell: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: radius.xxl,
    backgroundColor: colors.surfaceContainerLowest,
  },
  hidden: { position: 'absolute', width: '100%', height: '100%', opacity: 0 },
  error: { color: colors.error, marginTop: 8 },
});
