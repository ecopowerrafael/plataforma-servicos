/**
 * Shared domain rule: professional is eligible for combo
 * if they have ALL services in the combo.
 */
export function isProfessionalEligibleForCombo(
  professionalServiceIds: Set<string>,
  comboItemServiceIds: string[],
): boolean {
  return comboItemServiceIds.every((serviceId) => professionalServiceIds.has(serviceId));
}
