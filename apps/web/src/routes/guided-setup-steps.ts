export const GUIDED_SETUP_STEPS = [
  'business',
  'services',
  'team',
  'schedule',
  'page',
  'review',
] as const;

export type GuidedSetupStep = (typeof GUIDED_SETUP_STEPS)[number];

export const OLD_STEP_TO_GUIDED: Record<string, GuidedSetupStep> = {
  WELCOME: 'business',
  BUSINESS_TYPE: 'business',
  STARTER_CONTENT: 'services',
  BUSINESS_IDENTITY: 'business',
  BUSINESS_ADDRESS: 'business',
  CUSTOMIZE: 'page',
  LAYOUT: 'page',
  COLORS: 'page',
  SPLASH: 'page',
  APP_ICON: 'page',
  READY: 'review',
};

export function guidedStepForLegacy(step: string): GuidedSetupStep {
  return OLD_STEP_TO_GUIDED[step] ?? 'business';
}

export function isGuidedSetupReady(input: {
  business: boolean;
  services: number;
  professionals: number;
  schedule: boolean;
}): boolean {
  return input.business && input.services > 0 && input.professionals > 0 && input.schedule;
}

export function legacyStepForGuided(step: GuidedSetupStep): string {
  return {
    business: 'BUSINESS_IDENTITY',
    services: 'STARTER_CONTENT',
    team: 'BUSINESS_IDENTITY',
    schedule: 'BUSINESS_ADDRESS',
    page: 'CUSTOMIZE',
    review: 'READY',
  }[step];
}
