import { randomUUID } from 'node:crypto';

import {
  TenantCommercialPolicySchema,
  type UpdateTenantCommercialPolicyRequest,
} from '@plataforma/shared';

import { type RequestMetadata } from '../auth/identity.repository.js';
import { generatePublicId } from '../auth/token.service.js';

import type { PlatformAuthContext } from './platform.service.js';
import type { PrismaClient } from '../../database-client/client.js';

const DEFAULT_POLICY = {
  defaultTrialDays: 7,
  graceDays: 7,
  autoSuspendAfterGrace: true,
  allowAdminLoginWhileBlocked: true,
  allowCalendarReadWhileBlocked: true,
  allowAdminChangesWhileBlocked: false,
  allowInternalBookingWhileBlocked: false,
  allowPublicBookingWhileBlocked: false,
  publicSiteBehaviorWhileBlocked: 'HIDE_BOOKING' as const,
  adminMessage:
    'Sua assinatura está pendente. Regularize o pagamento para continuar utilizando todos os recursos do sistema. Seus dados permanecem preservados.',
  publicMessage:
    'Os agendamentos online deste estabelecimento estão temporariamente indisponíveis. Entre em contato diretamente com o estabelecimento para mais informações.',
};

function mapPolicy(policy: {
  publicId: string;
  defaultTrialDays: number;
  graceDays: number;
  autoSuspendAfterGrace: boolean;
  allowAdminLoginWhileBlocked: boolean;
  allowCalendarReadWhileBlocked: boolean;
  allowAdminChangesWhileBlocked: boolean;
  allowInternalBookingWhileBlocked: boolean;
  allowPublicBookingWhileBlocked: boolean;
  publicSiteBehaviorWhileBlocked: 'NORMAL' | 'HIDE_BOOKING' | 'OFFLINE';
  adminMessage: string;
  publicMessage: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return TenantCommercialPolicySchema.parse({
    ...policy,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  });
}

export class TenantCommercialPolicyService {
  public constructor(private readonly client: PrismaClient) {}

  public async getOrCreateRaw() {
    const existing = await this.client.tenantCommercialPolicy.findUnique({
      where: { singleton: true },
    });
    if (existing !== null) return existing;
    try {
      return await this.client.tenantCommercialPolicy.create({
        data: { publicId: randomUUID(), singleton: true, ...DEFAULT_POLICY },
      });
    } catch {
      const created = await this.client.tenantCommercialPolicy.findUnique({
        where: { singleton: true },
      });
      if (created !== null) return created;
      throw new Error('Não foi possível provisionar a política comercial padrão.');
    }
  }

  public async get() {
    return mapPolicy(await this.getOrCreateRaw());
  }

  public async update(
    input: UpdateTenantCommercialPolicyRequest,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const current = await this.getOrCreateRaw();
    const updated = await this.client.$transaction(async (transaction) => {
      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) data[key] = value;
      }
      const next = await transaction.tenantCommercialPolicy.update({
        where: { id: current.id },
        data,
      });
      await transaction.auditLog.create({
        data: {
          publicId: generatePublicId(),
          action: 'platform.commercial_policy.updated',
          targetType: 'tenant_commercial_policy',
          targetPublicId: next.publicId,
          userId: actor.user.id,
          metadata: { fields: Object.keys(input).join(',') },
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      return next;
    });
    return { policy: mapPolicy(updated) };
  }
}
