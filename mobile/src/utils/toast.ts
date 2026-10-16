import { Alert, Platform, ToastAndroid } from 'react-native';

// Aviso breve: Toast nativo en Android, alerta en iOS.
export function showToast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert('', message);
}
