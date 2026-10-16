import { StyleSheet, View } from 'react-native';

import { SecondaryButton, TextField } from '../../components';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSearch: () => void;
  placeholder: string;
  accessibilityLabel: string;
};

// Campo de búsqueda de las listas de administración: busca al pulsar «Buscar» o «Intro» (no en cada letra).
export function SearchRow({ value, onChangeText, onSearch, placeholder, accessibilityLabel }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <TextField
          accessibilityLabel={accessibilityLabel}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          leadingIcon="search"
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
      </View>
      <SecondaryButton title="Buscar" onPress={onSearch} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
