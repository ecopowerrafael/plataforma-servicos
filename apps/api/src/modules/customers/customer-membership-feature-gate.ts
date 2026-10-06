import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

type MembershipFeatureClient = PrismaClient | Prisma.TransactionClient;

export interface CustomerMembershipFeatureState {
  operatingModel: string | null;
  membershipSalesEnabled: boolean;
}

export async function getCustomerMembershipFeatureState(
  client: MembershipFeatureClient,
  tenantId: bigint,
): Promise<CustomerMembershipFeatureState> {
  const tenant = await client.tenant.findFirst({
    where: { id: tenantId },
    select: {
      operatingModel: true,
      settings: { select: { membershipSalesEnabled: true } },
    },
  });

  return {
    operatingModel: tenant?.operatingModel ?? null,
    membershipSalesEnabled: tenant?.settings?.membershipSalesEnabled === true,
  };
}

export function isCustomerMembershipFeatureEnabled(state: CustomerMembershipFeatureState): boolean {
  return state.operatingModel === 'MEMBERSHIP' && state.membershipSalesEnabled;
}

export async function assertCustomerMembershipFeatureEnabled(
  client: MembershipFeatureClient,
  tenantId: bigint,
): Promise<void> {
  const state = await getCustomerMembershipFeatureState(client, tenantId);
  if (state.operatingModel !== 'MEMBERSHIP') {
    throw new AppError({
      code: 'OPERATING_MODEL_INCOMPATIBLE',
      message: 'Este recurso só pode ser usado no modelo MEMBERSHIP.',
      statusCode: 409,
    });
  }
  if (!state.membershipSalesEnabled) {
    throw new AppError({
      code: 'MEMBERSHIP_SALES_DISABLED',
      message: 'A contratação e o uso de mensalidades estão desativados para este estabelecimento.',
      statusCode: 409,
    });
  }
}
