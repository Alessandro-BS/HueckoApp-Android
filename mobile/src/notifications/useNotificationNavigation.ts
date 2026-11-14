import type { NotificationData } from '@hueckoapp/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { useAuth } from '../context/AuthContext';
import { navigationRef } from '../navigation/navigationRef';

type Destination = { screen: 'Voting' | 'PlanDetail'; proposalId: string };

const KINDS = ['NEW_PROPOSAL', 'PLAN_CONFIRMED', 'PLAN_CANCELLED', 'EXPRESS_OPENED', 'EXPRESS_RESULT', 'REMINDER'];

// Lo que llega en `data` viene de fuera: se comprueba la forma antes de usarlo.
function parseData(raw: unknown): NotificationData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.kind !== 'string' || !KINDS.includes(d.kind)) return null;
  if (typeof d.proposalId !== 'string' || !d.proposalId) return null;
  if (typeof d.groupId !== 'string') return null;
  if (d.screen !== 'VOTING' && d.screen !== 'PLAN') return null;
  if (d.screen === 'VOTING' && d.kind !== 'NEW_PROPOSAL') return null;
  return d as NotificationData;
}

function toDestination(raw: unknown): Destination | null {
  const data = parseData(raw);
  if (!data) return null;
  return { screen: data.screen === 'VOTING' ? 'Voting' : 'PlanDetail', proposalId: data.proposalId };
}

/**
 * Avisos push con la app abierta (refresca Inicio y grupos) y al tocarlos (abre Votar o el detalle del plan).
 * Si la app estaba cerrada o aún no hay sesión, el destino se guarda y se abre una sola vez cuando haya navegación.
 */
export function useNotificationNavigation() {
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const pending = useRef<Destination | null>(null);
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  const flush = useRef(() => {
    const destination = pending.current;
    if (!destination || !signedInRef.current || !navigationRef.isReady()) return;
    pending.current = null;
    navigationRef.navigate(destination.screen, { proposalId: destination.proposalId });
  });

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const destination = toDestination(response.notification.request.content.data);
      if (!destination) return;
      pending.current = destination;
      flush.current();
    };
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    });
    const responded = Notifications.addNotificationResponseReceivedListener(open);
    let cancelled = false;
    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (!cancelled) open(last);
    });
    // Con la app cerrada la navegación tarda en estar lista: se reintenta hasta abrir el destino guardado.
    const timer = setInterval(() => flush.current(), 250);
    return () => {
      cancelled = true;
      clearInterval(timer);
      received.remove();
      responded.remove();
    };
  }, [queryClient]);
}
