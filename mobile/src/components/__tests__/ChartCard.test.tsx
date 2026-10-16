import { render, screen } from '@testing-library/react-native';

import { ChartCard } from '../ChartCard';
import { StatTile } from '../StatTile';

// El lector de pantalla lee el gráfico como texto: cada punto con su etiqueta completa, aunque el eje X no la muestre.
it('el resumen hablado usa la etiqueta completa de cada punto, no su posición', async () => {
  await render(
    <ChartCard
      testID="chart"
      title="Hora de inicio"
      data={[
        { label: '0h', a11yLabel: '0h', value: 0 },
        { label: '', a11yLabel: '1h', value: 2 },
        { label: '', a11yLabel: '2h', value: 1 },
      ]}
    />,
  );
  expect(screen.getByTestId('chart').props.accessibilityLabel).toBe('Hora de inicio. 0h: 0, 1h: 2, 2h: 1');
});

it('sin a11yLabel usa la etiqueta visible', async () => {
  await render(<ChartCard testID="chart" title="Estados" data={[{ label: 'Confirmado', value: 2 }]} />);
  expect(screen.getByTestId('chart').props.accessibilityLabel).toBe('Estados. Confirmado: 2');
});

it('vacío: el lector de pantalla oye el mismo aviso que se ve, no una lista de ceros', async () => {
  await render(<ChartCard testID="chart" title="Hora de inicio" emptyText="Ningún plan." data={[{ label: '0h', a11yLabel: '0h', value: 0 }]} />);
  expect(screen.getByText('Ningún plan.')).toBeTruthy();
  expect(screen.getByTestId('chart').props.accessibilityLabel).toBe('Hora de inicio. Ningún plan.');
});

it('StatTile: la pista también se lee', async () => {
  await render(
    <>
      <StatTile label="Llamadas a la IA" value={4} hint="Éxito: 75 %" />
      <StatTile label="Usuarios" value={3} />
    </>,
  );
  expect(screen.getByLabelText('Llamadas a la IA: 4. Éxito: 75 %')).toBeTruthy();
  expect(screen.getByLabelText('Usuarios: 3')).toBeTruthy(); // sin pista, igual que antes
});
