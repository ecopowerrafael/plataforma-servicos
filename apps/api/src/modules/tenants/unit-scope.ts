export function canAccessUnit(
  allowedUnitPublicIds: readonly string[] | null,
  unitPublicId: string,
): boolean {
  return allowedUnitPublicIds === null || allowedUnitPublicIds.includes(unitPublicId);
}
