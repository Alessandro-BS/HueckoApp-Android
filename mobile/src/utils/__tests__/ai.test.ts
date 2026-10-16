import { makeDraft, makeSuggestion } from '../../testing/fixtures';
import {
  CATEGORY_LABEL, ocrCountLabel, prefillFromDraft, prefillFromSuggestion, prefillWindows, RECOMMENDATION_BADGE, savedBlocksMessage,
} from '../ai';

it('categorías y recomendaciones con tildes', () => {
  expect(CATEGORY_LABEL).toEqual({
    ESTUDIO: 'Estudio', REUNION: 'Reunión', COMIDA: 'Comida', DEPORTE: 'Deporte', SALIDA: 'Salida', OTRO: 'Otro',
  });
  expect(RECOMMENDATION_BADGE.CONFIRMAR.text).toBe('Confirmar');
  expect(RECOMMENDATION_BADGE.REPROGRAMAR.text).toBe('Reprogramar');
  expect(RECOMMENDATION_BADGE.CANCELAR.text).toBe('Cancelar');
});

it('prefill desde un borrador: solo día y horas de la franja', () => {
  expect(prefillFromDraft(makeDraft())).toEqual({
    title: 'Estudiar para el parcial',
    placeName: 'Biblioteca central',
    window: { dayOfWeek: 2, startTime: '08:00', endTime: '20:00' },
    windows: [{ dayOfWeek: 2, startTime: '08:00', endTime: '20:00' }],
    votingDeadline: new Date(2026, 8, 30, 10, 0).toISOString(),
    category: 'ESTUDIO',
  });
  expect(prefillFromDraft(makeDraft({ window: null })).window).toBeNull();
});

it('las franjas del formulario: todas las opciones del borrador, o solo `window` si no vienen', () => {
  const viernes = (startTime: string, endTime: string) => ({ dayOfWeek: 5, startTime, endTime, availabilityPercentage: 100, freeMembers: 3 });
  const draft = makeDraft({ window: viernes('15:00', '17:00'), windows: [viernes('15:00', '17:00'), viernes('09:00', '11:00')] });
  expect(prefillWindows(prefillFromDraft(draft))).toEqual([
    { dayOfWeek: 5, startTime: '15:00', endTime: '17:00' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '11:00' },
  ]);
  expect(prefillWindows(prefillFromSuggestion(makeSuggestion()))).toEqual([prefillFromSuggestion(makeSuggestion()).window]);
  expect(prefillWindows(prefillFromSuggestion(makeSuggestion({ window: null })))).toEqual([]);
});

it('prefill desde una idea: sin plazo (lo elige el usuario)', () => {
  expect(prefillFromSuggestion(makeSuggestion({ window: null, placeIdea: null }))).toEqual({
    title: 'Sesión de estudio antes del parcial', placeName: null, window: null, votingDeadline: null, category: 'ESTUDIO',
  });
});

it('textos del OCR en singular y plural', () => {
  expect(ocrCountLabel(1)).toBe('1 bloque detectado');
  expect(ocrCountLabel(3)).toBe('3 bloques detectados');
  expect(savedBlocksMessage(1)).toBe('Se añadió 1 bloque a tu horario.');
  expect(savedBlocksMessage(4)).toBe('Se añadieron 4 bloques a tu horario.');
});
