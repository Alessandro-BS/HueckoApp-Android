import { Alert } from 'react-native';

// Confirmación antes de cancelar un plan: la comparten «Cancelar plan» del detalle y «Cancelar» de la votación exprés.
export function confirmCancelPlan(planTitle: string, onConfirm: () => void) {
  Alert.alert('Cancelar plan', `¿Seguro que quieres cancelar «${planTitle}»? El grupo dejará de verlo como pendiente.`, [
    { text: 'Volver', style: 'cancel' },
    { text: 'Cancelar plan', style: 'destructive', onPress: onConfirm },
  ]);
}
