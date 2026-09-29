const OPEN = '<<<DATOS';
const CLOSE = 'DATOS>>>';

// Todo texto escrito por usuarios (nombres, descripciones, títulos, texto libre) entra al prompt por aquí:
// se quitan las marcas para que nadie pueda cerrar el bloque de datos y colar instrucciones.
export function userData(text: string): string {
  let clean = text;
  // Repetir hasta que no queden marcas: quitar una puede juntar otras (p. ej. «<<<DA<<<DATOSTOS»).
  for (let previous = ''; previous !== clean; ) {
    previous = clean;
    clean = clean.split(OPEN).join('').split(CLOSE).join('');
  }
  return `${OPEN}\n${clean}\n${CLOSE}`;
}
