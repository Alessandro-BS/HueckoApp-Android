// Mismos colores de categoría que la app Kotlin (UI spec §4.5).
const CATEGORY_COLORS = ['#6750A4', '#535288', '#7B4B8E', '#4A6B5B', '#8C523B', '#4E588E', '#823B58', '#7A5926'];

export const categoryColor = (index: number) =>
  CATEGORY_COLORS[((index % CATEGORY_COLORS.length) + CATEGORY_COLORS.length) % CATEGORY_COLORS.length];

// Igual que String.hashCode() de Java, para que cada grupo/bloque tenga el mismo color que en Android.
export const javaHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
};

export const categoryColorFor = (key: string) => categoryColor(javaHash(key));
