const storageKey = 'selectedTenantPublicId';

export function readSelectedTenant(): string | undefined {
  return sessionStorage.getItem(storageKey) ?? undefined;
}

export function selectTenant(publicId: string): void {
  sessionStorage.setItem(storageKey, publicId);
}

export function clearSelectedTenant(): void {
  sessionStorage.removeItem(storageKey);
}
