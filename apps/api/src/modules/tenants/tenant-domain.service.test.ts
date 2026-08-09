import { describe, expect, it } from 'vitest';

import { isManagedSubdomain } from './tenant-domain.service.js';

describe('tenant domain security rules', () => {
  it('accepts exactly one label under the configured platform domain', () => {
    expect(isManagedSubdomain('minha-loja.sites.example.com', 'sites.example.com')).toBe(true);
    expect(isManagedSubdomain('outra.minha-loja.sites.example.com', 'sites.example.com')).toBe(
      false,
    );
    expect(isManagedSubdomain('sites.example.com', 'sites.example.com')).toBe(false);
    expect(isManagedSubdomain('minha-loja.attacker.example', 'sites.example.com')).toBe(false);
    expect(isManagedSubdomain('minha-loja.sites.example.com', null)).toBe(false);
  });
});
