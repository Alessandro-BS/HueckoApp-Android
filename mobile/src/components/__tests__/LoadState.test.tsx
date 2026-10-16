import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { LoadState } from '..';

const child = <Text>contenido</Text>;

describe('LoadState', () => {
  it('cargando sin datos muestra el indicador y no el contenido', async () => {
    await render(
      <LoadState loading error={null} hasData={false} onRetry={() => {}}>
        {child}
      </LoadState>,
    );
    expect(screen.getByLabelText('Cargando')).toBeTruthy();
    expect(screen.queryByText('contenido')).toBeNull();
  });

  it('con error y sin datos muestra el mensaje y Reintentar llama a onRetry', async () => {
    const onRetry = jest.fn();
    await render(
      <LoadState loading={false} error="Sin conexión" hasData={false} onRetry={onRetry}>
        {child}
      </LoadState>,
    );
    expect(screen.getByText('Sin conexión')).toBeTruthy();
    expect(screen.queryByText('contenido')).toBeNull();
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('con datos ya cargados sigue mostrando el contenido pese a recargar o fallar', async () => {
    await render(
      <LoadState loading error="Sin conexión" hasData onRetry={() => {}}>
        {child}
      </LoadState>,
    );
    expect(screen.getByText('contenido')).toBeTruthy();
    expect(screen.queryByText('Sin conexión')).toBeNull();
    expect(screen.queryByLabelText('Cargando')).toBeNull();
  });

  it('sin carga ni error muestra el contenido', async () => {
    await render(
      <LoadState loading={false} error={null} hasData={false} onRetry={() => {}}>
        {child}
      </LoadState>,
    );
    expect(screen.getByText('contenido')).toBeTruthy();
  });
});
