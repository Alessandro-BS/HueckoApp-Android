// Paleta morada de HueckoApp, la misma de la versión Kotlin (legacy-android/.../ui/theme/Color.kt).
export const colors = {
  primary: '#6750A4',
  primaryPressed: '#4F378B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',

  secondary: '#625B71',
  secondaryPressed: '#4A4458',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E8DEF8',
  onSecondaryContainer: '#1D192B',

  tertiary: '#7D5260',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFD8E4',
  onTertiaryContainer: '#31111D',

  error: '#B3261E',
  onError: '#FFFFFF',
  errorContainer: '#F9DEDC',
  onErrorContainer: '#410E0B',

  success: '#2F6B4F',
  onSuccess: '#FFFFFF',
  successContainer: '#DBEEE2',
  onSuccessContainer: '#10301F',

  warning: '#7A5210',
  onWarning: '#FFFFFF',
  warningContainer: '#F8EACF',
  onWarningContainer: '#3A2504',

  background: '#FEF7FF',
  onBackground: '#1D1B20',
  surface: '#FEF7FF',
  onSurface: '#1D1B20',
  surfaceVariant: '#E7E0EC',
  onSurfaceVariant: '#49454F',

  outline: '#79747E',
  outlineVariant: '#CAC4D0',

  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainer: '#F3EDF7',
  surfaceContainerHigh: '#ECE6F0',
  inverseSurface: '#322F35',
  inverseOnSurface: '#F4EFF4',
  scrim: '#1D1B20',

  // Botones deshabilitados (M3: onSurface al 12 % y al 38 %).
  disabledContainer: 'rgba(29,27,32,0.12)',
  disabledContent: 'rgba(29,27,32,0.38)',
} as const;
