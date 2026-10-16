import type { Group } from '@hueckoapp/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppDialog, TextField } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, typography } from '../../theme';

type DialogProps = {
  submit: (value: string) => Promise<Group>;
  onDone: (group: Group) => void;
  onDismiss: () => void;
};

export function CreateGroupDialog({ submit, onDone, onDismiss }: DialogProps) {
  const [name, setName] = useState('');
  const action = useAction(submit);

  const confirm = async () => {
    if (!name.trim()) return;
    const result = await action.run(name);
    if (result.ok) onDone(result.value);
  };

  return (
    <AppDialog
      title="Crear Nuevo Grupo"
      confirmLabel="Crear"
      onConfirm={() => void confirm()}
      onDismiss={onDismiss}
      confirmDisabled={!name.trim()}
      loading={action.loading}
    >
      <TextField
        label="Nombre del grupo"
        value={name}
        onChangeText={(text) => {
          setName(text);
          action.clearError();
        }}
        maxLength={60}
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => void confirm()}
        error={action.error ?? undefined}
      />
    </AppDialog>
  );
}

export function JoinGroupDialog({ submit, onDone, onDismiss }: DialogProps) {
  const [code, setCode] = useState('');
  const action = useAction(submit);

  const confirm = async () => {
    if (!code.trim()) return;
    const result = await action.run(code);
    if (result.ok) onDone(result.value);
  };

  return (
    <AppDialog
      title="Unirse a un Grupo"
      confirmLabel="Unirse"
      onConfirm={() => void confirm()}
      onDismiss={onDismiss}
      confirmDisabled={!code.trim()}
      loading={action.loading}
    >
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        Ingresa el código de invitación que te compartió el administrador del grupo.
      </Text>
      <View style={{ height: 16 }} />
      <TextField
        label="Código de Invitación"
        value={code}
        onChangeText={(text) => {
          // Se fuerza a mayúsculas en cada pulsación (UI spec §2.5).
          setCode(text.toUpperCase());
          action.clearError();
        }}
        autoCapitalize="characters"
        maxLength={32}
        returnKeyType="done"
        onSubmitEditing={() => void confirm()}
        error={action.error ?? undefined}
      />
    </AppDialog>
  );
}
