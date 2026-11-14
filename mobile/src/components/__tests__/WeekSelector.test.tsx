import { fireEvent, render, screen } from '@testing-library/react-native';

import { WeekSelector } from '../WeekSelector';

const NOW = new Date('2026-09-29T15:00:00Z'); // martes 29/09 10:00 en Lima

it('muestra las 4 semanas y cambia', async () => {
  const onChange = jest.fn();
  await render(<WeekSelector value="2026-09-28" onChange={onChange} now={NOW} />);
  for (const label of ['Esta semana', 'Próxima semana', 'En 2 semanas', 'En 3 semanas']) {
    expect(screen.getByText(label)).toBeTruthy();
  }
  expect(screen.getByRole('button', { name: /Esta semana/ }).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByText('En 2 semanas'));
  expect(onChange).toHaveBeenCalledWith('2026-10-12');
});
