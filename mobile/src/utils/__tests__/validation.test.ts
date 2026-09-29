import { validateEmail, validateName, validatePassword } from '../validation';

describe('validación de formularios', () => {
  it.each([
    ['', 'El correo es requerido'],
    ['   ', 'El correo es requerido'],
    ['ana', 'Ingresa un correo válido'],
    ['ana@correo', 'Ingresa un correo válido'],
    [' ana@correo.com ', null],
  ])('validateEmail(%j) → %j', (v, expected) => expect(validateEmail(v)).toBe(expected));

  it.each([
    ['', 'La contraseña es requerida'],
    ['  ', 'La contraseña es requerida'],
    ['1234567', 'Mínimo 8 caracteres'],
    ['12345678', null],
    ['a'.repeat(72), null],
    ['a'.repeat(73), 'Máximo 72 caracteres'],
  ])('validatePassword(%j) → %j', (v, expected) => expect(validatePassword(v)).toBe(expected));

  it.each([
    ['', 'El nombre es requerido'],
    ['  ', 'El nombre es requerido'],
    ['Ana', null],
    ['a'.repeat(80), null],
    [` ${'a'.repeat(80)} `, null],
    ['a'.repeat(81), 'Máximo 80 caracteres'],
  ])('validateName(%j) → %j', (v, expected) => expect(validateName(v)).toBe(expected));
});
