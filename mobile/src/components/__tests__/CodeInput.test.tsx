import { fireEvent, render, screen } from '@testing-library/react-native';

import { CodeInput } from '../CodeInput';

it('solo deja dígitos y máximo 6', async () => {
  const onChange = jest.fn();
  await render(<CodeInput value="" onChange={onChange} />);
  const input = screen.getByLabelText('Código de 6 dígitos');
  expect(input.props.maxLength).toBe(6);
  expect(input.props.keyboardType).toBe('number-pad');
  expect(input.props.textContentType).toBe('oneTimeCode');
  expect(input.props.autoComplete).toBe('sms-otp');
  await fireEvent.changeText(input, '12a3-45 6789');
  expect(onChange).toHaveBeenCalledWith('123456');
});

it('muestra los dígitos en las casillas y el error', async () => {
  await render(<CodeInput value="12" onChange={() => undefined} error="Código incorrecto" />);
  expect(screen.getByText('1')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('Código incorrecto')).toBeTruthy();
});
