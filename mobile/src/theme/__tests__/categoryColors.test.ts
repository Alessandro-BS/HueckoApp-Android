import { categoryColor, categoryColorFor, javaHash } from '..';

describe('categoryColors', () => {
  it('javaHash coincide con String.hashCode() de Java', () => {
    expect(javaHash('')).toBe(0);
    expect(javaHash('a')).toBe(97);
    expect(javaHash('Proyecto Integrador')).toBe(1032726658);
  });

  it('categoryColor usa módulo no negativo sobre 8 colores', () => {
    expect(categoryColor(0)).toBe('#6750A4');
    expect(categoryColor(8)).toBe('#6750A4');
    expect(categoryColor(-1)).toBe('#7A5926');
  });

  it('categoryColorFor es estable para la misma clave', () => {
    expect(categoryColorFor('g1')).toBe(categoryColorFor('g1'));
  });
});
