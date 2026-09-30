import { describe, expect, it } from 'vitest';

import { trustProxySchema } from '../src/config/trust-proxy';

describe('TRUST_PROXY (D9)', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['FALSE', false],
    ['true', true],
    ['0', 0],
    ['1', 1],
    [' 2 ', 2],
  ])('%j → %j', (input, expected) => {
    expect(trustProxySchema.parse(input)).toBe(expected);
  });

  it.each(['yes', '-1', '1.5', 'loopback'])('%j no es válido', (input) => {
    expect(trustProxySchema.safeParse(input).success).toBe(false);
  });
});
