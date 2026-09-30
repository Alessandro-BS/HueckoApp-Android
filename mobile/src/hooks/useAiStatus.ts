import { getAiStatus } from '../api/ai';
import { useResource } from './useResource';

// ¿La IA del servidor está en modo demostración? Si la consulta falla, no se avisa (demo = false).
export function useAiStatus() {
  const { data } = useResource(getAiStatus);
  return { demo: data?.provider === 'mock' };
}
