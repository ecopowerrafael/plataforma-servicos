import { type UpdateTenantIdentityRequest } from '@plataforma/shared';

import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface OnboardingIdentityUpdate {
  step: string;
  completed?: boolean | undefined;
  hideChecklist?: boolean | undefined;
  businessProfile?: Prisma.TenantUpdateInput['businessProfile'] | undefined;
  businessTypeCustom?: string | null | undefined;
  displayName?: string | undefined;
  slug?: string | undefined;
}

const slugAlreadyChanged = () =>
  new AppError({
    code: 'TENANT_SLUG_CHANGE_ALREADY_USED',
    message: 'O endereço Agendei deste estabelecimento já foi alterado uma vez.',
    statusCode: 409,
  });

const slugConflict = (cause: unknown) =>
  new AppError({
    code: 'TENANT_SLUG_CONFLICT',
    message: 'Este endereço Agendei já está em uso.',
    statusCode: 409,
    cause,
  });

const isUniqueConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export async function getTenantIdentity(client: PrismaClient, tenantId: bigint) {
  const tenant = await client.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      legalName: true,
      displayName: true,
      slug: true,
      slugChangedAt: true,
      businessProfile: true,
      businessTypeCustom: true,
    },
  });
  return {
    identity: {
      legalName: tenant.legalName,
      displayName: tenant.displayName,
      slug: tenant.slug,
      slugChangeAvailable: tenant.slugChangedAt === null,
      businessProfile: tenant.businessProfile,
      businessTypeCustom: tenant.businessTypeCustom,
    },
  };
}

async function lockSlugChange(
  transaction: Prisma.TransactionClient,
  tenantId: bigint,
  currentSlug: string,
  requestedSlug: string | undefined,
  changedAt: Date,
) {
  if (requestedSlug === undefined || requestedSlug === currentSlug) return;
  const locked = await transaction.tenant.updateMany({
    where: { id: tenantId, slugChangedAt: null },
    data: { slug: requestedSlug, slugChangedAt: changedAt },
  });
  if (locked.count !== 1) throw slugAlreadyChanged();
}

export async function updateTenantIdentity(
  client: PrismaClient,
  tenantId: bigint,
  input: UpdateTenantIdentityRequest,
) {
  const current = await client.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { slug: true, slugChangedAt: true },
  });
  if (input.slug !== undefined && input.slug !== current.slug && current.slugChangedAt !== null)
    throw slugAlreadyChanged();
  try {
    await client.$transaction(async (transaction) => {
      await lockSlugChange(transaction, tenantId, current.slug, input.slug, new Date());
      await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
          ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          ...(input.businessProfile === undefined ? {} : { businessProfile: input.businessProfile }),
          ...(input.businessTypeCustom === undefined
            ? {}
            : { businessTypeCustom: input.businessTypeCustom }),
        },
      });
    });
  } catch (error) {
    if (isUniqueConflict(error)) throw slugConflict(error);
    throw error;
  }
  return getTenantIdentity(client, tenantId);
}

export async function updateTenantOnboarding(
  client: PrismaClient,
  tenantId: bigint,
  input: OnboardingIdentityUpdate,
) {
  const now = new Date();
  const current = await client.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { slug: true, slugChangedAt: true },
  });
  if (input.slug !== undefined && input.slug !== current.slug && current.slugChangedAt !== null)
    throw slugAlreadyChanged();
  try {
    return await client.$transaction(async (transaction) => {
      await lockSlugChange(transaction, tenantId, current.slug, input.slug, now);
      return transaction.tenant.update({
        where: { id: tenantId },
        data: {
          onboardingStep: input.step,
          ...(input.completed === true ? { onboardingCompletedAt: now } : {}),
          ...(input.hideChecklist === true ? { onboardingChecklistHiddenAt: now } : {}),
          ...(input.businessProfile === undefined ? {} : { businessProfile: input.businessProfile }),
          ...(input.businessTypeCustom === undefined
            ? {}
            : { businessTypeCustom: input.businessTypeCustom }),
          ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        },
        select: {
          onboardingStep: true,
          onboardingCompletedAt: true,
          onboardingChecklistHiddenAt: true,
        },
      });
    });
  } catch (error) {
    if (isUniqueConflict(error)) throw slugConflict(error);
    throw error;
  }
}
