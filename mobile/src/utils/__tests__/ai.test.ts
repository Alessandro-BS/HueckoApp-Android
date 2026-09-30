import { makeDraft, makeSuggestion } from '../../testing/fixtures';
import { CATEGORY_LABEL, ocrCountLabel, prefillFromDraft, prefillFromSuggestion, RECOMMENDATION_BADGE, savedBlocksMessage } from '../ai';

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
    votingDeadline: new Date(2026, 8, 30, 10, 0).toISOString(),
    category: 'ESTUDIO',
  });
  expect(prefillFromDraft(makeDraft({ window: null })).window).toBeNull();
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
