import type { ProximityRequest, ProximityStatus } from '@hueckoapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, errorMessage } from '../api/client';
import { acceptProximity, cancelProximity, getProximity, rejectProximity, sendInvite, sendJoin } from '../api/proximity';
import { queryKeys } from '../api/queryClient';

type Target = { role: 'INVITE'; groupId: string } | { role: 'JOIN' };
export type ProximityPhase = 'idle' | 'sending' | 'active' | 'done';

const POLL_MS = 1500;
const isActive = (status: ProximityStatus | undefined) => status === 'WAITING' || status === 'MATCHED';

// Cancela sin esperar la respuesta y sin dejar una promesa rechazada sin atender.
const cancelQuietly = (id: string) => {
  try {
    Promise.resolve(cancelProximity(id)).catch(() => undefined);
  } catch {
    // Da igual: el servidor lo vence solo.
  }
};

// Un intento por proximidad: lo crea (send), lo consulta cada 1,5 s mientras siga WAITING o MATCHED,
// permite aceptar/rechazar (quien invita) y lo cancela al salir de la pantalla con el intento vivo.
export function useProximitySession(target: Target) {
  const client = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const sending = useRef(false);
  const skipUpdates = useRef(0);
  const mounted = useRef(true);
  const live = useRef<{ id: string | null; status: ProximityStatus | undefined }>({ id: null, status: undefined });
  const targetRef = useRef(target);
  targetRef.current = target;

  const create = useMutation({
    mutationFn: (): Promise<ProximityRequest> => {
      const current = targetRef.current;
      return current.role === 'INVITE' ? sendInvite(current.groupId) : sendJoin();
    },
    onSuccess: (created) => {
      // Se salió de la pantalla mientras se enviaba: el intento recién creado no debe quedar vivo.
      if (!mounted.current) {
        if (isActive(created.status)) cancelQuietly(created.id);
        return;
      }
      client.setQueryData(queryKeys.proximity(created.id), created);
      setId(created.id);
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  const query = useQuery({
    queryKey: queryKeys.proximity(id ?? ''),
    queryFn: () => getProximity(id as string),
    enabled: id !== null,
    staleTime: POLL_MS, // el POST ya trajo el estado: no se vuelve a pedir al montar la consulta
    refetchInterval: (q) => (isActive(q.state.data?.status) ? POLL_MS : false),
  });
  const request = id === null ? undefined : query.data;

  live.current = { id, status: request?.status };

  // Un error de aceptar/rechazar se borra cuando llega la siguiente consulta (salvo la que él mismo pidió).
  useEffect(() => {
    if (skipUpdates.current > 0) {
      skipUpdates.current -= 1;
      return;
    }
    setActionError(null);
  }, [query.dataUpdatedAt]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const { id: current, status } = live.current;
      if (current && isActive(status)) cancelQuietly(current);
    };
  }, []);

  const send = useCallback(() => {
    if (sending.current || live.current.id) return;
    sending.current = true;
    setActionError(null);
    create.mutate();
  }, [create]);

  const respond = useCallback(
    async (action: (id: string) => Promise<ProximityRequest>) => {
      const current = live.current.id;
      if (!current) return;
      setActionError(null);
      try {
        client.setQueryData(queryKeys.proximity(current), await action(current));
      } catch (e) {
        if (!mounted.current) return;
        // Reloj del celular adelantado: tocó Aceptar antes de que el servidor lo permita. Se pide el estado de nuevo.
        if (e instanceof ApiError && e.code === 'PROXIMITY_NOT_PENDING' && live.current.status === 'MATCHED') {
          setActionError('Espera un momento…');
          skipUpdates.current = 1;
          void client.invalidateQueries({ queryKey: queryKeys.proximity(current) });
          return;
        }
        setActionError(errorMessage(e));
      }
    },
    [client],
  );
  const accept = useCallback(() => respond(acceptProximity), [respond]);
  const reject = useCallback(() => respond(rejectProximity), [respond]);

  const reset = useCallback(() => {
    const { id: current, status } = live.current;
    if (current && isActive(status)) cancelQuietly(current);
    if (current) client.removeQueries({ queryKey: queryKeys.proximity(current) });
    live.current = { id: null, status: undefined };
    sending.current = false;
    setActionError(null);
    setId(null);
    create.reset();
  }, [client, create]);

  const phase: ProximityPhase = create.isPending
    ? 'sending'
    : id === null
      ? 'idle'
      : request && !isActive(request.status)
        ? 'done'
        : 'active';

  const error = actionError ?? (create.error ? errorMessage(create.error) : null) ?? (query.error ? errorMessage(query.error) : null);

  return { request, phase, error, send, accept, reject, reset };
}
