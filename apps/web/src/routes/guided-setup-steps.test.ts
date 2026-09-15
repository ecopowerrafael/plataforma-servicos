import { describe, expect, it } from 'vitest';

import {
  GUIDED_SETUP_STEPS,
  guidedStepForLegacy,
  isGuidedSetupReady,
  legacyStepForGuided,
} from './guided-setup-steps.js';

describe('guided setup legacy compatibility', () => {
  it('keeps the six macro steps stable', () => {
    expect(GUIDED_SETUP_STEPS).toEqual([
      'business',
      'services',
      'team',
      'schedule',
      'page',
      'review',
    ]);
  });

  it('maps every legacy state without resetting the tenant', () => {
    expect(guidedStepForLegacy('WELCOME')).toBe('business');
    expect(guidedStepForLegacy('STARTER_CONTENT')).toBe('services');
    expect(guidedStepForLegacy('BUSINESS_IDENTITY')).toBe('business');
    expect(guidedStepForLegacy('CUSTOMIZE')).toBe('page');
    expect(guidedStepForLegacy('APP_ICON')).toBe('page');
    expect(guidedStepForLegacy('READY')).toBe('review');
  });

  it('uses business as the safe fallback for unknown values', () => {
    expect(guidedStepForLegacy('UNKNOWN')).toBe('business');
  });

  it('persists a stable legacy step when leaving a macro step', () => {
    expect(legacyStepForGuided('services')).toBe('STARTER_CONTENT');
    expect(legacyStepForGuided('page')).toBe('CUSTOMIZE');
    expect(legacyStepForGuided('review')).toBe('READY');
  });

  it('requires only the four essential setup items', () => {
    expect(
      isGuidedSetupReady({ business: true, services: 1, professionals: 1, schedule: true }),
    ).toBe(true);
    expect(
      isGuidedSetupReady({ business: true, services: 0, professionals: 1, schedule: true }),
    ).toBe(false);
    expect(
      isGuidedSetupReady({ business: true, services: 1, professionals: 1, schedule: false }),
    ).toBe(false);
  });
});
