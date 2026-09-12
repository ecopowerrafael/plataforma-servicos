/**
 * Assets de exemplo versionados no projeto (`apps/web/public/demo`).
 * Se o arquivo não existir, o consumidor cai no fallback: hero só com o
 * gradiente do tema e profissional com as iniciais.
 */
export const DEMO_AVATAR = '/demo/professional-avatar.webp';

const BANNERS: Record<string, string> = {
  BARBERSHOP: 'barbershop.webp',
  BEAUTY_SALON: 'beauty-salon.webp',
  AESTHETIC_CLINIC: 'aesthetics.webp',
  MEDICAL_CLINIC: 'health.webp',
  PSYCHOLOGY: 'health.webp',
  NUTRITION: 'health.webp',
  DENTISTRY: 'health.webp',
  STUDIO: 'generic.webp',
  TATTOO_STUDIO: 'tattoo.webp',
  PET_CARE: 'pet.webp',
  SPA: 'spa.webp',
  MASSAGE: 'spa.webp',
  PERSONAL_TRAINER: 'fitness.webp',
  CONSULTING: 'consulting.webp',
  GENERIC: 'generic.webp',
};

export function demoBannerFor(businessProfile: string): string {
  return `/demo/banners/${BANNERS[businessProfile] ?? BANNERS.GENERIC ?? 'generic.webp'}`;
}
