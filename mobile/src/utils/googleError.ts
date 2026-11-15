import { ApiError, errorMessage } from '../api/client';

/** Texto del error de «Continuar con Google»: los de la librería ya vienen en español; los del servidor, por errorMessage. */
export const googleErrorMessage = (e: unknown): string =>
  e instanceof Error && !(e instanceof ApiError) && e.message ? e.message : errorMessage(e);
