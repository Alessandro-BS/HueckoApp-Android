import type { Group, GroupMember } from '@hueckoapp/shared';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { errorMessage } from '../../../api/client';
import { Avatar, Badge, SecondaryButton } from '../../../components';
import { categoryColor, colors, typography } from '../../../theme';
import { showToast } from '../../../utils/toast';

type Props = {
  group: Group;
  currentUserId: string;
  onToggleEssential: (userId: string, isEssential: boolean) => Promise<void>;
  onSetRole: (userId: string, role: 'ORGANIZER' | 'MEMBER') => Promise<void>;
  onLeave: () => Promise<void>;
};

export function MembersTab({ group, currentUserId, onToggleEssential, onSetRole, onLeave }: Props) {
  const isOrganizer = group.members.some((m) => m.id === currentUserId && m.role === 'ORGANIZER');
  const [leaving, setLeaving] = useState(false);

  const toggle = async (member: GroupMember, value: boolean) => {
    try {
      await onToggleEssential(member.id, value);
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  const setRole = async (member: GroupMember, role: 'ORGANIZER' | 'MEMBER') => {
    try {
      await onSetRole(member.id, role);
      if (role === 'ORGANIZER') showToast(`${member.name} ahora es organizador del grupo.`);
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  const confirmRemoveOrganizer = (member: GroupMember) => {
    const message =
      member.id === currentUserId
        ? `Dejarás de organizar «${group.name}»: ya no podrás editarlo ni gestionar sus planes.`
        : `${member.name} dejará de organizar el grupo.`;
    Alert.alert('Quitar organizador', message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => void setRole(member, 'MEMBER') },
    ]);
  };

  const leave = async () => {
    setLeaving(true);
    try {
      await onLeave();
    } catch (e) {
      showToast(errorMessage(e));
      setLeaving(false);
    }
  };

  const confirmLeave = () => {
    if (leaving) return;
    Alert.alert('Salir del grupo', `¿Seguro que quieres salir de «${group.name}»? Tu horario dejará de contar en sus huecos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => void leave() },
    ]);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {isOrganizer ? (
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
          Marca como imprescindibles a quienes deben estar sí o sí: si uno falta a un plan, el plan se vuelve a coordinar. Los organizadores editan el grupo, gestionan sus planes y pueden nombrar o quitar a otros organizadores.
        </Text>
      ) : null}
      {group.members.map((member, index) => (
        <View key={member.id} style={styles.row}>
          <Avatar name={member.name} color={categoryColor(index)} size={40} />
          <View style={styles.texts}>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>
              {member.id === currentUserId ? `${member.name} (tú)` : member.name}
            </Text>
            <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{member.email}</Text>
            {member.role === 'ORGANIZER' || member.isEssential ? (
              <View style={styles.badges}>
                {member.role === 'ORGANIZER' ? (
                  <Badge text="Organizador" containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
                ) : null}
                {member.isEssential ? (
                  <Badge text="Imprescindible" containerColor={colors.tertiaryContainer} contentColor={colors.onTertiaryContainer} />
                ) : null}
              </View>
            ) : null}
            {isOrganizer ? (
              member.role === 'ORGANIZER' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar organizador: ${member.name}`}
                  onPress={() => confirmRemoveOrganizer(member)}
                  hitSlop={8}
                  style={styles.action}
                >
                  <Text style={[typography.labelLarge, { color: colors.error }]}>Quitar organizador</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Hacer organizador: ${member.name}`}
                  onPress={() => void setRole(member, 'ORGANIZER')}
                  hitSlop={8}
                  style={styles.action}
                >
                  <Text style={[typography.labelLarge, { color: colors.primary }]}>Hacer organizador</Text>
                </Pressable>
              )
            ) : null}
          </View>
          {isOrganizer ? (
            <Switch
              accessibilityLabel={`Imprescindible: ${member.name}`}
              value={member.isEssential}
              onValueChange={(value) => void toggle(member, value)}
              trackColor={{ true: colors.primary, false: colors.surfaceContainerHigh }}
              thumbColor={colors.surfaceContainerLowest}
            />
          ) : null}
        </View>
      ))}
      <SecondaryButton title={leaving ? 'Saliendo…' : 'Salir del grupo'} icon="logout" color={colors.error} onPress={confirmLeave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texts: { flex: 1 },
  action: { marginTop: 8, alignSelf: 'flex-start' },
  badges: { flexDirection: 'row', gap: 6, marginTop: 6 },
});
