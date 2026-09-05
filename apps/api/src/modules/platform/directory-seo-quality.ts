/**
 * SEO Quality evaluation for DirectoryBusiness.
 *
 * Pure function: no Prisma, no side effects.
 * Used during business creation, update, and import.
 */

export type DirectorySeoEligibilityReason =
  | 'BUSINESS_INACTIVE'
  | 'BUSINESS_NOT_INDEXABLE'
  | 'CATEGORY_INACTIVE'
  | 'CATEGORY_NOT_INDEXABLE'
  | 'MISSING_NAME'
  | 'MISSING_CITY'
  | 'INVALID_STATE'
  | 'MISSING_ADDRESS'
  | 'MISSING_CONTACT'
  | 'LOW_SCORE';

export interface SeoEvaluation {
  score: number;
  eligible: boolean;
  reasons: DirectorySeoEligibilityReason[];
}

export interface DirectoryBusinessSeoInput {
  active: boolean;
  indexable: boolean;
  name: string;
  city: string;
  state: string;
  rawAddress: string;
  neighborhood: string | null;
  postalCode: string | null;
  phone: string | null;
  whatsapp: string | null;
  websiteUrl: string | null;
  tenantId: bigint | null;
  categoryActive: boolean;
  categoryIndexable: boolean;
}

function isValidPostalCode(cep: string | null): boolean {
  if (cep === null) return false;
  return cep.trim().length === 8;
}

function isValidState(state: string): boolean {
  return !!(state && state.trim().length === 2);
}

function isValidName(name: string): boolean {
  return !!(name && name.trim().length > 0);
}

function isValidCity(city: string): boolean {
  return !!(city && city.trim().length > 0);
}

function isValidAddress(rawAddress: string): boolean {
  return !!(rawAddress && rawAddress.trim().length > 0);
}

function hasContact(phone: string | null, whatsapp: string | null): boolean {
  const hasPhone = phone && phone.trim().length > 0;
  const hasWhatsapp = whatsapp && whatsapp.trim().length > 0;
  return !!(hasPhone || hasWhatsapp);
}

/**
 * Evaluates SEO quality and eligibility for a DirectoryBusiness.
 *
 * IMPORTANT: IMAGE DOES NOT PARTICIPATE IN SCORING.
 * Image presence/absence: 0 points, does not affect eligibility.
 *
 * Score calculation (max 100):
 * - Name: +20
 * - Category valid: +10
 * - City: +15
 * - State (2 chars): +5
 * - Address: +15
 * - Neighborhood: +5
 * - CEP (8 chars): +5
 * - Phone: +10
 * - WhatsApp: +15
 * - Website: +5
 * - Tenant linked: +10
 * ─────────────────────
 * Total max: 115 → clamped to 100
 *
 * Eligibility requires:
 * - active = true
 * - indexable = true
 * - category.active = true
 * - category.indexable = true
 * - name not empty
 * - city not empty
 * - state valid (2 chars)
 * - rawAddress not empty
 * - phone OR whatsapp present
 * - score >= 60
 */
export function evaluateDirectoryBusinessSeo(input: DirectoryBusinessSeoInput): SeoEvaluation {
  const reasons: DirectorySeoEligibilityReason[] = [];
  let score = 0;

  // Check mandatory flags first
  if (!input.active) {
    reasons.push('BUSINESS_INACTIVE');
  }
  if (!input.indexable) {
    reasons.push('BUSINESS_NOT_INDEXABLE');
  }
  if (!input.categoryActive) {
    reasons.push('CATEGORY_INACTIVE');
  }
  if (!input.categoryIndexable) {
    reasons.push('CATEGORY_NOT_INDEXABLE');
  }

  // If any flag fails, eligible is false
  if (reasons.length > 0) {
    return {
      score: 0,
      eligible: false,
      reasons,
    };
  }

  // Calculate score
  if (isValidName(input.name)) {
    score += 20;
  } else {
    reasons.push('MISSING_NAME');
  }

  // Category is valid if we reached here
  score += 10;

  if (isValidCity(input.city)) {
    score += 15;
  } else {
    reasons.push('MISSING_CITY');
  }

  if (isValidState(input.state)) {
    score += 5;
  } else {
    reasons.push('INVALID_STATE');
  }

  if (isValidAddress(input.rawAddress)) {
    score += 15;
  } else {
    reasons.push('MISSING_ADDRESS');
  }

  if (input.neighborhood !== null && input.neighborhood.trim().length > 0) {
    score += 5;
  }

  if (isValidPostalCode(input.postalCode)) {
    score += 5;
  }

  if (input.phone && input.phone.trim().length > 0) {
    score += 10;
  }

  if (input.whatsapp && input.whatsapp.trim().length > 0) {
    score += 15;
  }

  if (input.websiteUrl && input.websiteUrl.trim().length > 0) {
    score += 5;
  }

  if (input.tenantId !== null) {
    score += 10;
  }

  // Check contact requirement
  if (!hasContact(input.phone, input.whatsapp)) {
    reasons.push('MISSING_CONTACT');
  }

  // Clamp score
  const clampedScore = Math.min(score, 100);

  // Check score threshold
  if (clampedScore < 60) {
    reasons.push('LOW_SCORE');
  }

  // Determine eligibility
  const eligible =
    input.active &&
    input.indexable &&
    input.categoryActive &&
    input.categoryIndexable &&
    isValidName(input.name) &&
    isValidCity(input.city) &&
    isValidState(input.state) &&
    isValidAddress(input.rawAddress) &&
    hasContact(input.phone, input.whatsapp) &&
    clampedScore >= 60;

  return {
    score: clampedScore,
    eligible,
    reasons,
  };
}
