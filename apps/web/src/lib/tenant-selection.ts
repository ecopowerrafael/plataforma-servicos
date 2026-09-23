const storageKey = 'selectedTenantPublicId';

export interface SelectableTenant {
  tenant: { publicId: string; slug: string };
  membership: { roleCode: string };
}

export function readSelectedTenant(): string | undefined {
  return sessionStorage.getItem(storageKey) ?? undefined;
}

export function selectTenant(publicId: string): void {
  sessionStorage.setItem(storageKey, publicId);
}

export function clearSelectedTenant(): void {
  sessionStorage.removeItem(storageKey);
}

export function tenantRoleLabel(roleCode: string): string {
  return (
    {
      OWNER: 'Proprietário',
      ADMIN: 'Administrador',
      MANAGER: 'Gerente',
      RECEPTIONIST: 'Recepção',
      PROFESSIONAL: 'Profissional',
    } as Record<string, string>
  )[roleCode] ?? roleCode;
}

export function tenantDestination(tenant: SelectableTenant): string {
  return tenant.membership.roleCode === 'PROFESSIONAL'
    ? `/public/${tenant.tenant.slug}/profissional`
    : '/app';
}

export function selectSingleTenantIfAvailable(tenants: SelectableTenant[]): string | null {
  if (tenants.length !== 1) return null;
  const [tenant] = tenants;
  if (tenant === undefined) return null;
  selectTenant(tenant.tenant.publicId);
  return tenantDestination(tenant);
}
