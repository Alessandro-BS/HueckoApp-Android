import { useEffect } from 'react';

import { showToast } from '../utils/toast';

// Si una RECARGA falla con datos ya en pantalla, se avisa con un toast y el contenido se queda como estaba.
// (Si falla la primera carga, LoadState ya muestra el error con «Reintentar».)
export function useRefreshErrorToast(error: string | null, hasData: boolean) {
  useEffect(() => {
    if (error && hasData) showToast(error);
  }, [error, hasData]);
}
