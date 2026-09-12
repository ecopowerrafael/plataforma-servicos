import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearSelectedTenant,
  readSelectedTenant,
  selectSingleTenantIfAvailable,
  tenantDestination,
  tenantRoleLabel,
  type SelectableTenant,
} from './tenant-selection.js';

function tenant(publicId: string, roleCode = 'OWNER', slug = 'tenant'): SelectableTenant {
  return { tenant: { publicId, slug }, membership: { roleCode } };
}

describe('tenant selection helpers', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
  });

  afterEach(() => {
    clearSelectedTenant();
  });

  it('auto selects the only tenant using the same selected tenant storage', () => {
    const destination = selectSingleTenantIfAvailable([tenant('tenant-1', 'OWNER')]);
    expect(destination).toBe('/app');
    expect(readSelectedTenant()).toBe('tenant-1');
  });

  it('keeps multi tenant users on the selection flow', () => {
    const destination = selectSingleTenantIfAvailable([
      tenant('tenant-1', 'OWNER'),
      tenant('tenant-2', 'ADMIN'),
    ]);
    expect(destination).toBeNull();
    expect(readSelectedTenant()).toBeUndefined();
  });

  it('keeps zero tenant and commercial-only users without automatic tenant access', () => {
    const destination = selectSingleTenantIfAvailable([]);
    expect(destination).toBeNull();
    expect(readSelectedTenant()).toBeUndefined();
  });

  it('routes professional tenant memberships to the professional area', () => {
    expect(tenantDestination(tenant('tenant-1', 'PROFESSIONAL', 'barbearia-silva'))).toBe(
      '/public/barbearia-silva/profissional',
    );
  });

  it('localizes known tenant role labels', () => {
    expect(tenantRoleLabel('OWNER')).toBe('Proprietário');
    expect(tenantRoleLabel('ADMIN')).toBe('Administrador');
    expect(tenantRoleLabel('PROFESSIONAL')).toBe('Profissional');
    expect(tenantRoleLabel('MANAGER')).toBe('Gerente');
    expect(tenantRoleLabel('RECEPTIONIST')).toBe('Recepção');
  });
});
