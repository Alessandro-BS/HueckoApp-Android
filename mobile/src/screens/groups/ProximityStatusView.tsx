import { MaterialIcons } from '@expo/vector-icons';
import type { ProximityRequest, ProximityRole } from '@hueckoapp/shared';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, Vibration, View } from 'react-native';

import { ErrorBanner, PrimaryButton, SecondaryButton } from '../../components';
import type { ProximityPhase } from '../../hooks/useProximitySession';
import { colors, typography } from '../../theme';

// Devuelve true cuando la pareja MATCHED ya se puede aceptar (ahora ≥ acceptableFrom, hora del servidor) y vibra
// una sola vez por intento en ese instante. Así no vibra una pareja que después se anula por dudosa.
export function useAcceptable(request: ProximityRequest | undefined): boolean {
  const id = request?.id;
  const from = request?.status === 'MATCHED' ? request.acceptableFrom : null;
  const [ready, setReady] = useState(false);
  const vibratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!id || !from) {
      setReady(false);
      return;
    }
    const fire = () => {
      setReady(true);
      if (vibratedFor.current !== id) {
        vibratedFor.current = id;
        Vibration.vibrate();
      }
    };
    const delay = Date.parse(from) - Date.now();
    if (!(delay > 0)) {
      fire();
      return;
    }
    setReady(false);
    const timer = setTimeout(fire, delay);
    return () => clearTimeout(timer);
  }, [id, from]);

  return ready;
}

type Props = {
  role: ProximityRole;
  request: ProximityRequest | undefined;
  phase: ProximityPhase;
  /** Mensaje de error de la sesión (envío, consulta, aceptar/rechazar). */
  error: string | null;
  /** Hay sensor de proximidad (false en Expo Go, iOS o sin sensor). */
  available: boolean;
  /** La pareja ya se puede aceptar (ver `useAcceptable`). */
  acceptable: boolean;
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
  onUseCode: () => void;
};

const FINAL_MESSAGES: Record<string, (role: ProximityRole) => string> = {
  REJECTED: (role) => (role === 'JOIN' ? 'Te rechazaron la solicitud.' : 'Rechazaste la solicitud.'),
  EXPIRED: () => 'Se acabó el tiempo. Vuelvan a intentarlo.',
  AMBIGUOUS: () => 'Hubo otro intento cerca. Repitan o usen el código',
  CANCELLED: () => 'El intento se canceló.',
};

function Message({ icon, children }: { icon: keyof typeof MaterialIcons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={styles.message}>
      <MaterialIcons name={icon} size={56} color={colors.primary} />
      <Text style={[typography.titleLarge, styles.text]}>{children}</Text>
    </View>
  );
}

// Vista común de los estados de «Acercar para invitar» y «Unirse acercando».
export function ProximityStatusView({ role, request, phase, error, available, acceptable, onAccept, onReject, onRetry, onUseCode }: Props) {
  const peer = request?.peer?.name ?? '';
  const group = request?.group?.name ?? '';
  const status = request?.status;
  let body: React.ReactNode;
  let actions: React.ReactNode = null;

  if (phase === 'idle' && error) {
    body = <ErrorBanner message={error} />;
    actions = <PrimaryButton title="Intentar de nuevo" icon="refresh" onPress={onRetry} />;
  } else if (phase === 'idle' && !available) {
    body = <Message icon="sensors-off">Tu celular no tiene sensor de proximidad (o estás en Expo Go)</Message>;
  } else if (phase === 'idle') {
    body = <Message icon="smartphone">Junta los celulares pantalla con pantalla</Message>;
  } else if (phase === 'sending' || status === 'WAITING' || !request) {
    body = <Message icon="radar">Buscando…</Message>;
  } else if (status === 'MATCHED' && role === 'INVITE') {
    body = (
      <Message icon="person-add">
        <Text style={styles.bold}>{peer}</Text> quiere unirse a <Text style={styles.italic}>{group}</Text>
      </Message>
    );
    actions = acceptable ? (
      <View style={styles.row}>
        <SecondaryButton title="Rechazar" style={styles.flex} onPress={onReject} />
        <PrimaryButton title="Aceptar" style={styles.flex} onPress={onAccept} />
      </View>
    ) : (
      <Text style={[typography.labelLarge, styles.waiting]}>Confirmando…</Text>
    );
  } else if (status === 'MATCHED') {
    body = (
      <Message icon="hourglass-top">
        Esperando a que <Text style={styles.bold}>{peer}</Text> te acepte en <Text style={styles.italic}>{group}</Text>
      </Message>
    );
  } else if (status === 'ACCEPTED') {
    body = <Message icon="check-circle">{role === 'INVITE' ? `${peer} ya es parte del grupo` : `Te uniste a ${group}`}</Message>;
  } else {
    body = <Message icon="info-outline">{FINAL_MESSAGES[status ?? '']?.(role) ?? 'El intento terminó.'}</Message>;
    actions = <PrimaryButton title="Intentar de nuevo" icon="refresh" onPress={onRetry} />;
  }

  return (
    <View style={styles.screen}>
      {body}
      {/* Fallo no bloqueante con el intento vivo (consulta o aceptar/rechazar): se sigue mostrando el estado actual. */}
      {error && phase !== 'idle' ? <ErrorBanner message={error} /> : null}
      {actions}
      <SecondaryButton title="Usar el código" icon="vpn-key" onPress={onUseCode} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: 16, justifyContent: 'center', gap: 16 },
  message: { alignItems: 'center', gap: 16, paddingVertical: 24 },
  text: { color: colors.onSurface, textAlign: 'center' },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  waiting: { color: colors.onSurfaceVariant, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
