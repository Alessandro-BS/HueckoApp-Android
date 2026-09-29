import type { AiClient, AiTask } from './ai-client';

// Respuestas fijas del modo demostración (sin GEMINI_API_KEY). Pasan por la misma validación que las de Gemini.
// El OCR es el mock literal de GeminiService.kt (domain spec §4); los números de franja se validan contra los
// huecos reales del grupo, así que si el grupo tiene menos huecos esas ideas salen sin franja.
export const MOCK_RESPONSES: Record<AiTask, unknown> = {
  'schedule-ocr': {
    blocks: [
      { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', label: 'Matemáticas Discretas' },
      { dayOfWeek: 1, startTime: '10:30', endTime: '12:30', label: 'Arquitectura de Software' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '11:00', label: 'Bases de Datos Avanzadas' },
      { dayOfWeek: 5, startTime: '14:00', endTime: '16:00', label: 'Desarrollo Móvil Android' },
    ],
  },
  'proposal-draft': {
    title: 'Plan de ejemplo con el grupo',
    category: 'REUNION',
    placeName: 'Biblioteca central',
    windowIndex: 1,
    deadlineHours: 48,
  },
  'plan-suggestions': {
    suggestions: [
      {
        title: 'Sesión de estudio antes del parcial',
        category: 'ESTUDIO',
        placeIdea: 'Biblioteca central',
        windowIndex: 1,
        reason: 'Es el primer hueco de la semana en el que todo el grupo está libre.',
      },
      {
        title: 'Almuerzo del grupo',
        category: 'COMIDA',
        placeIdea: 'Cafetería de la universidad',
        windowIndex: 2,
        reason: 'Un plan corto para ponerse al día sin quitar tiempo de estudio.',
      },
      {
        title: 'Partido de fulbito',
        category: 'DEPORTE',
        placeIdea: 'Losa deportiva del campus',
        windowIndex: 3,
        reason: 'Hay un hueco largo en común: ideal para despejarse juntos.',
      },
    ],
  },
  'voting-summary': {
    summary: 'Resumen de demostración: la franja más votada sigue siendo la favorita y no hay imprevistos graves pendientes.',
    recommendation: 'CONFIRMAR',
    reason: 'Son datos de ejemplo: con una clave de Gemini el resumen se basa en los votos reales.',
  },
};

export function createMockAiClient(): AiClient {
  return {
    provider: 'mock',
    generateJson: async ({ task }) => JSON.stringify(MOCK_RESPONSES[task]),
  };
}
