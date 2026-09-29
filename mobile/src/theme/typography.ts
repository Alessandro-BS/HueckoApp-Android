import type { TextStyle } from 'react-native';

export type TypographyVariant =
  | 'displaySmall' | 'headlineLarge' | 'headlineMedium' | 'headlineSmall'
  | 'titleLarge' | 'titleMedium' | 'titleSmall'
  | 'bodyLarge' | 'bodyMedium' | 'bodySmall'
  | 'labelLarge' | 'labelMedium' | 'labelSmall';

export const typography: Record<TypographyVariant, TextStyle> = {
  displaySmall: { fontSize: 34, fontWeight: '700', lineHeight: 40, letterSpacing: -0.7 },
  headlineLarge: { fontSize: 30, fontWeight: '700', lineHeight: 36, letterSpacing: -0.6 },
  headlineMedium: { fontSize: 24, fontWeight: '700', lineHeight: 30, letterSpacing: -0.5 },
  headlineSmall: { fontSize: 20, fontWeight: '700', lineHeight: 26, letterSpacing: -0.4 },
  titleLarge: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  titleMedium: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  titleSmall: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  bodyLarge: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodyMedium: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodySmall: { fontSize: 12, fontWeight: '400', lineHeight: 17 },
  labelLarge: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  labelMedium: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  labelSmall: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
};
