import { MaterialIcons } from '@expo/vector-icons';
import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, typography } from '../theme';
import type { IconName } from './icons';

type Props = {
  /** Etiqueta encima del campo. Si se omite, pasar accessibilityLabel. */
  label?: string;
  accessibilityLabel?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  leadingIcon?: IconName;
  error?: string;
  /** Texto de ayuda bajo el campo cuando no hay error. */
  helperText?: string;
  secureToggle?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  maxLength?: number;
  inputRef?: Ref<TextInput>;
  testID?: string;
};

export function TextField({
  label,
  accessibilityLabel,
  value,
  onChangeText,
  placeholder,
  leadingIcon,
  error,
  helperText,
  secureToggle = false,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  maxLength,
  inputRef,
  testID,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? colors.error : focused ? colors.primary : colors.outlineVariant;
  const borderWidth = error || focused ? 2 : 1;

  return (
    <View>
      {label ? (
        <>
          <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
          <View style={{ height: 6 }} />
        </>
      ) : null}
      <View style={[styles.container, { borderColor, borderWidth }]}>
        {leadingIcon ? <MaterialIcons name={leadingIcon} size={20} color={colors.onSurfaceVariant} style={styles.leading} /> : null}
        <TextInput
          ref={inputRef}
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? label}
          style={[typography.bodyLarge, styles.input, { color: colors.onSurface }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.outline}
          selectionColor={colors.primary}
          secureTextEntry={secureToggle && hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            onPress={() => setHidden((h) => !h)}
            style={styles.toggle}
          >
            <MaterialIcons name={hidden ? 'visibility' : 'visibility-off'} size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[typography.bodySmall, styles.hint, { color: colors.error }]}>
          {error}
        </Text>
      ) : helperText ? (
        <Text style={[typography.bodySmall, styles.hint, { color: colors.onSurfaceVariant }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: radius.xxl, paddingHorizontal: 12 },
  leading: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 0 },
  toggle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  hint: { marginTop: 4 },
});
