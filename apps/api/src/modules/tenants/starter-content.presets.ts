import { type BusinessProfileCode } from '@plataforma/shared';

export interface StarterServicePreset {
  name: string;
  /** Chave do catálogo curado de ícones já usado no app público. */
  iconKey: string;
  priceCents: number;
  durationMinutes: number;
}

export interface StarterPreset {
  services: [StarterServicePreset, StarterServicePreset, StarterServicePreset];
  combo: { name: string; serviceIndexes: [number, number]; discountPercent: number };
  professional: { name: string; specialty: string };
  /** Arquivo em `apps/web/public/demo/banners/`; ausência tem fallback elegante. */
  banner: string;
}

const preset = (
  services: StarterPreset['services'],
  combo: StarterPreset['combo'],
  professional: StarterPreset['professional'],
  banner: string,
): StarterPreset => ({ services, combo, professional, banner });

/**
 * Conteúdo inicial por tipo de negócio. São registros reais, editáveis e
 * removíveis depois — nada aqui é mock de frontend.
 */
export const STARTER_PRESETS: Record<BusinessProfileCode, StarterPreset> = {
  BARBERSHOP: preset(
    [
      { name: 'Corte masculino', iconKey: 'scissors', priceCents: 4500, durationMinutes: 30 },
      { name: 'Barba', iconKey: 'razor', priceCents: 3500, durationMinutes: 30 },
      { name: 'Sobrancelha', iconKey: 'eyeglass', priceCents: 2000, durationMinutes: 20 },
    ],
    { name: 'Combo Corte + Barba', serviceIndexes: [0, 1], discountPercent: 12 },
    { name: 'Rafael', specialty: 'Cortes e barba' },
    'barbershop.webp',
  ),
  BEAUTY_SALON: preset(
    [
      { name: 'Corte', iconKey: 'cut', priceCents: 6000, durationMinutes: 45 },
      { name: 'Escova', iconKey: 'brush', priceCents: 5000, durationMinutes: 40 },
      { name: 'Hidratação', iconKey: 'droplet', priceCents: 8000, durationMinutes: 60 },
    ],
    { name: 'Combo Corte + Hidratação', serviceIndexes: [0, 2], discountPercent: 12 },
    { name: 'Juliana', specialty: 'Cabelo e tratamentos' },
    'beauty-salon.webp',
  ),
  AESTHETIC_CLINIC: preset(
    [
      { name: 'Limpeza de pele', iconKey: 'sparkles', priceCents: 12000, durationMinutes: 60 },
      { name: 'Massagem facial', iconKey: 'massage', priceCents: 9000, durationMinutes: 45 },
      { name: 'Drenagem linfática', iconKey: 'droplet', priceCents: 13000, durationMinutes: 60 },
    ],
    { name: 'Combo Limpeza + Massagem facial', serviceIndexes: [0, 1], discountPercent: 15 },
    { name: 'Carolina', specialty: 'Estética facial e corporal' },
    'aesthetics.webp',
  ),
  MEDICAL_CLINIC: preset(
    [
      { name: 'Consulta clínica', iconKey: 'stethoscope', priceCents: 25000, durationMinutes: 40 },
      { name: 'Retorno', iconKey: 'heartbeat', priceCents: 12000, durationMinutes: 30 },
      { name: 'Avaliação inicial', iconKey: 'user-heart', priceCents: 30000, durationMinutes: 60 },
    ],
    { name: 'Pacote Avaliação + Retorno', serviceIndexes: [2, 1], discountPercent: 10 },
    { name: 'Dra. Helena', specialty: 'Clínica geral' },
    'health.webp',
  ),
  PSYCHOLOGY: preset(
    [
      { name: 'Sessão individual', iconKey: 'user-heart', priceCents: 20000, durationMinutes: 50 },
      { name: 'Primeira sessão', iconKey: 'stethoscope', priceCents: 22000, durationMinutes: 60 },
      { name: 'Sessão de casal', iconKey: 'heartbeat', priceCents: 28000, durationMinutes: 60 },
    ],
    { name: 'Pacote Primeira sessão + Acompanhamento', serviceIndexes: [1, 0], discountPercent: 10 },
    { name: 'Marina', specialty: 'Psicologia clínica' },
    'health.webp',
  ),
  NUTRITION: preset(
    [
      { name: 'Consulta nutricional', iconKey: 'leaf', priceCents: 20000, durationMinutes: 50 },
      { name: 'Retorno nutricional', iconKey: 'heartbeat', priceCents: 12000, durationMinutes: 30 },
      {
        name: 'Avaliação de composição corporal',
        iconKey: 'stethoscope',
        priceCents: 15000,
        durationMinutes: 40,
      },
    ],
    { name: 'Pacote Consulta + Avaliação', serviceIndexes: [0, 2], discountPercent: 12 },
    { name: 'Paula', specialty: 'Nutrição clínica' },
    'health.webp',
  ),
  DENTISTRY: preset(
    [
      { name: 'Avaliação odontológica', iconKey: 'dental', priceCents: 15000, durationMinutes: 40 },
      { name: 'Limpeza', iconKey: 'sparkles', priceCents: 18000, durationMinutes: 50 },
      { name: 'Clareamento', iconKey: 'droplet', priceCents: 60000, durationMinutes: 60 },
    ],
    { name: 'Combo Avaliação + Limpeza', serviceIndexes: [0, 1], discountPercent: 12 },
    { name: 'Dr. Bruno', specialty: 'Odontologia geral' },
    'health.webp',
  ),
  STUDIO: preset(
    [
      { name: 'Sessão de estúdio', iconKey: 'sparkles', priceCents: 25000, durationMinutes: 60 },
      { name: 'Ensaio individual', iconKey: 'user-heart', priceCents: 35000, durationMinutes: 90 },
      { name: 'Sessão expressa', iconKey: 'flame', priceCents: 15000, durationMinutes: 30 },
    ],
    { name: 'Pacote Sessão + Ensaio', serviceIndexes: [0, 1], discountPercent: 12 },
    { name: 'Alex', specialty: 'Produção e direção' },
    'generic.webp',
  ),
  TATTOO_STUDIO: preset(
    [
      { name: 'Tatuagem pequena', iconKey: 'needle', priceCents: 25000, durationMinutes: 60 },
      { name: 'Sessão de tatuagem', iconKey: 'flame', priceCents: 60000, durationMinutes: 120 },
      { name: 'Retoque', iconKey: 'sparkles', priceCents: 10000, durationMinutes: 45 },
    ],
    { name: 'Combo Tatuagem + Retoque', serviceIndexes: [0, 2], discountPercent: 10 },
    { name: 'Diego', specialty: 'Tatuagem autoral' },
    'tattoo.webp',
  ),
  PET_CARE: preset(
    [
      { name: 'Banho', iconKey: 'wash', priceCents: 7000, durationMinutes: 45 },
      { name: 'Tosa', iconKey: 'scissors', priceCents: 9000, durationMinutes: 60 },
      { name: 'Corte de unhas', iconKey: 'cut', priceCents: 3000, durationMinutes: 20 },
    ],
    { name: 'Combo Banho + Tosa', serviceIndexes: [0, 1], discountPercent: 12 },
    { name: 'Camila', specialty: 'Banho e tosa' },
    'pet.webp',
  ),
  SPA: preset(
    [
      { name: 'Massagem relaxante', iconKey: 'massage', priceCents: 15000, durationMinutes: 60 },
      { name: 'Day spa', iconKey: 'leaf', priceCents: 30000, durationMinutes: 120 },
      { name: 'Escalda-pés', iconKey: 'droplet', priceCents: 8000, durationMinutes: 40 },
    ],
    { name: 'Combo Massagem + Escalda-pés', serviceIndexes: [0, 2], discountPercent: 15 },
    { name: 'Renata', specialty: 'Terapias relaxantes' },
    'spa.webp',
  ),
  MASSAGE: preset(
    [
      { name: 'Massagem relaxante', iconKey: 'massage', priceCents: 14000, durationMinutes: 60 },
      { name: 'Massagem modeladora', iconKey: 'yoga', priceCents: 16000, durationMinutes: 60 },
      { name: 'Drenagem linfática', iconKey: 'droplet', priceCents: 15000, durationMinutes: 60 },
    ],
    { name: 'Combo Relaxante + Drenagem', serviceIndexes: [0, 2], discountPercent: 12 },
    { name: 'Tiago', specialty: 'Massoterapia' },
    'spa.webp',
  ),
  PERSONAL_TRAINER: preset(
    [
      { name: 'Aula personalizada', iconKey: 'yoga', priceCents: 12000, durationMinutes: 60 },
      { name: 'Avaliação física', iconKey: 'heartbeat', priceCents: 15000, durationMinutes: 45 },
      { name: 'Treino em dupla', iconKey: 'user-heart', priceCents: 18000, durationMinutes: 60 },
    ],
    { name: 'Pacote Avaliação + Aula', serviceIndexes: [1, 0], discountPercent: 12 },
    { name: 'Lucas', specialty: 'Treinamento funcional' },
    'fitness.webp',
  ),
  CONSULTING: preset(
    [
      { name: 'Sessão de consultoria', iconKey: 'user-heart', priceCents: 30000, durationMinutes: 60 },
      { name: 'Diagnóstico inicial', iconKey: 'stethoscope', priceCents: 20000, durationMinutes: 45 },
      { name: 'Acompanhamento', iconKey: 'heartbeat', priceCents: 25000, durationMinutes: 60 },
    ],
    { name: 'Pacote Diagnóstico + Sessão', serviceIndexes: [1, 0], discountPercent: 10 },
    { name: 'Fernanda', specialty: 'Consultoria e mentoria' },
    'consulting.webp',
  ),
  GENERIC: preset(
    [
      { name: 'Atendimento padrão', iconKey: 'user-heart', priceCents: 10000, durationMinutes: 45 },
      { name: 'Atendimento expresso', iconKey: 'flame', priceCents: 6000, durationMinutes: 30 },
      { name: 'Atendimento completo', iconKey: 'sparkles', priceCents: 18000, durationMinutes: 60 },
    ],
    { name: 'Combo Padrão + Expresso', serviceIndexes: [0, 1], discountPercent: 10 },
    { name: 'Alex', specialty: 'Atendimento' },
    'generic.webp',
  ),
};

export function starterPresetFor(profile: BusinessProfileCode): StarterPreset {
  return STARTER_PRESETS[profile];
}

/** Agenda inicial: segunda a sábado, 09:00–18:00, domingo fechado. */
export const STARTER_WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
export const STARTER_WORKDAY = { startsAt: '09:00', endsAt: '18:00' } as const;
