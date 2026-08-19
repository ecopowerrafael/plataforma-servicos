import { z } from 'zod';

/**
 * Modelo operacional do estabelecimento. HYBRID existe no roadmap, mas não é
 * liberado nesta versão: o domínio só reconhece os dois modos abaixo.
 */
export const OperatingModelSchema = z.enum(['SERVICE_PRICING', 'MEMBERSHIP']);
export type OperatingModel = z.infer<typeof OperatingModelSchema>;

export const OperatingModelLabels: Record<OperatingModel, string> = Object.freeze({
  SERVICE_PRICING: 'Cobrança por serviço',
  MEMBERSHIP: 'Mensalidade (assinatura do cliente)',
});

export const OperatingModelDescriptions: Record<OperatingModel, string> = Object.freeze({
  SERVICE_PRICING: 'O cliente paga cada atendimento pelo preço do serviço.',
  MEMBERSHIP: 'O cliente paga uma mensalidade e usa os benefícios do plano.',
});

/**
 * Registro central de capacidades. Nenhuma tela deve comparar `operatingModel`
 * diretamente: pergunte por capacidade, aqui e no backend.
 */
export const TenantCapabilitySchema = z.enum([
  /** Cobrar o atendimento pelo preço do serviço. */
  'appointments.service_pricing',
  /** Cadastrar planos, benefícios e assinantes. */
  'memberships.manage',
  /** Cliente contratar plano e pagar mensalidade. */
  'memberships.checkout',
  /** Consumir benefício de plano em um atendimento. */
  'memberships.benefits',
  /** Comissão financeira automática sobre o atendimento. */
  'commissions.appointment_based',
  /** Métricas de produtividade do profissional (não é valor devido). */
  'professionals.productivity_metrics',
]);
export type TenantCapability = z.infer<typeof TenantCapabilitySchema>;

const CAPABILITIES_BY_MODEL: Record<OperatingModel, readonly TenantCapability[]> = Object.freeze({
  SERVICE_PRICING: Object.freeze([
    'appointments.service_pricing',
    'commissions.appointment_based',
  ] as const),
  MEMBERSHIP: Object.freeze([
    'appointments.service_pricing',
    'memberships.manage',
    'memberships.checkout',
    'memberships.benefits',
    'professionals.productivity_metrics',
  ] as const),
});

export const capabilitiesFor = (model: OperatingModel): readonly TenantCapability[] =>
  CAPABILITIES_BY_MODEL[model];

export const hasCapability = (model: OperatingModel, capability: TenantCapability): boolean =>
  CAPABILITIES_BY_MODEL[model].includes(capability);

/**
 * Troca de modelo não é um switch: a saída de MEMBERSHIP exige que nenhuma
 * assinatura siga ativa. Quem valida de fato é o backend; isto documenta a regra.
 */
export const OperatingModelChangeSchema = z
  .object({ operatingModel: OperatingModelSchema })
  .strict();
export type OperatingModelChange = z.infer<typeof OperatingModelChangeSchema>;
