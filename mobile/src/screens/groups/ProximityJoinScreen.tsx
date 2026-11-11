import type { Group } from '@hueckoapp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { joinGroup } from '../../api/groups';
import { pingServer } from '../../api/proximity';
import { queryKeys } from '../../api/queryClient';
import { useProximitySession } from '../../hooks/useProximitySession';
import { useProximityTrigger } from '../../hooks/useProximityTrigger';
import type { AppStackScreen } from '../../navigation/types';
import { showToast } from '../../utils/toast';
import { JoinGroupDialog } from './GroupDialogs';
import { ProximityStatusView, useAcceptable } from './ProximityStatusView';

// «Unirse acercando»: se junta el celular con el del dueño del grupo y se espera a que acepte.
export function ProximityJoinScreen({ navigation }: AppStackScreen<'ProximityJoin'>) {
  const client = useQueryClient();
  const session = useProximitySession({ role: 'JOIN' });
  const { request, phase, error } = session;
  const [codeDialog, setCodeDialog] = useState(false);

  // Despierta al servidor (Render duerme) antes de juntar los celulares.
  useEffect(() => {
    void pingServer();
  }, []);

  const { available } = useProximityTrigger(phase === 'idle' && !error && !codeDialog, session.send);
  const acceptable = useAcceptable(request);

  const acceptedGroup = request?.status === 'ACCEPTED' ? request.group : null;
  useEffect(() => {
    if (!acceptedGroup) return;
    void client.invalidateQueries({ queryKey: queryKeys.groups });
    navigation.replace('GroupDetail', { groupId: acceptedGroup.id, name: acceptedGroup.name });
  }, [acceptedGroup, client, navigation]);

  // «Usar el código» reutiliza el diálogo de GroupListScreen aquí mismo (sin navegar de vuelta con parámetros).
  const joinWithCode = async (code: string) => {
    const group = await joinGroup(code);
    await client.invalidateQueries({ queryKey: queryKeys.groups });
    return group;
  };
  const onJoined = (group: Group) => {
    setCodeDialog(false);
    showToast(`Te uniste a «${group.name}».`);
    navigation.replace('GroupDetail', { groupId: group.id, name: group.name });
  };

  return (
    <>
      <ProximityStatusView
        role="JOIN"
        request={request}
        phase={phase}
        error={error}
        available={available}
        acceptable={acceptable}
        onAccept={() => undefined}
        onReject={() => undefined}
        onRetry={session.reset}
        onUseCode={() => setCodeDialog(true)}
      />
      {codeDialog ? <JoinGroupDialog submit={joinWithCode} onDone={onJoined} onDismiss={() => setCodeDialog(false)} /> : null}
    </>
  );
}
