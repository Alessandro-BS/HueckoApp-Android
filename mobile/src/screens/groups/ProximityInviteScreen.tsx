import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys } from '../../api/queryClient';
import { pingServer } from '../../api/proximity';
import { useProximitySession } from '../../hooks/useProximitySession';
import { useProximityTrigger } from '../../hooks/useProximityTrigger';
import type { AppStackScreen } from '../../navigation/types';
import { ProximityStatusView, useAcceptable } from './ProximityStatusView';

const CLOSE_AFTER_MS = 2000;

// «Acercar para invitar»: al juntar el celular con el de quien quiere unirse, el dueño acepta o rechaza.
export function ProximityInviteScreen({ navigation, route }: AppStackScreen<'ProximityInvite'>) {
  const { groupId } = route.params;
  const client = useQueryClient();
  const session = useProximitySession({ role: 'INVITE', groupId });
  const { request, phase, error } = session;

  // Despierta al servidor (Render duerme) antes de juntar los celulares.
  useEffect(() => {
    void pingServer();
  }, []);

  // Solo se escucha el sensor con la pantalla lista: sin intento activo ni error pendiente.
  const { available } = useProximityTrigger(phase === 'idle' && !error, session.send);
  const acceptable = useAcceptable(request);

  const accepted = request?.status === 'ACCEPTED';
  useEffect(() => {
    if (!accepted) return;
    void client.invalidateQueries({ queryKey: queryKeys.group(groupId) });
    const timer = setTimeout(() => navigation.goBack(), CLOSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [accepted, client, groupId, navigation]);

  return (
    <ProximityStatusView
      role="INVITE"
      request={request}
      phase={phase}
      error={error}
      available={available}
      acceptable={acceptable}
      onAccept={() => void session.accept()}
      onReject={() => void session.reject()}
      onRetry={session.reset}
      onUseCode={() => navigation.goBack()}
    />
  );
}
