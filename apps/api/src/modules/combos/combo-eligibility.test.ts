import { describe, it, expect } from 'vitest';
import { isProfessionalEligibleForCombo } from './combo-eligibility.js';

describe('isProfessionalEligibleForCombo', () => {
  it('returns true when professional has all services', () => {
    const professionalServices = new Set(['svc-1', 'svc-2', 'svc-3']);
    const comboServices = ['svc-1', 'svc-2'];

    const result = isProfessionalEligibleForCombo(professionalServices, comboServices);
    expect(result).toBe(true);
  });

  it('returns false when professional missing one service', () => {
    const professionalServices = new Set(['svc-1', 'svc-3']);
    const comboServices = ['svc-1', 'svc-2'];

    const result = isProfessionalEligibleForCombo(professionalServices, comboServices);
    expect(result).toBe(false);
  });

  it('returns true when professional has extra services', () => {
    const professionalServices = new Set(['svc-1', 'svc-2', 'svc-3', 'svc-4']);
    const comboServices = ['svc-1', 'svc-2'];

    const result = isProfessionalEligibleForCombo(professionalServices, comboServices);
    expect(result).toBe(true);
  });

  it('returns false when professional has no services', () => {
    const professionalServices = new Set<string>();
    const comboServices = ['svc-1', 'svc-2'];

    const result = isProfessionalEligibleForCombo(professionalServices, comboServices);
    expect(result).toBe(false);
  });

  it('returns true when combo has no services (edge case)', () => {
    const professionalServices = new Set(['svc-1', 'svc-2']);
    const comboServices: string[] = [];

    const result = isProfessionalEligibleForCombo(professionalServices, comboServices);
    expect(result).toBe(true);
  });
});
