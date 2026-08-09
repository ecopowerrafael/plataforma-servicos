import { z } from 'zod';

const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
export const TenantHostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(hostnamePattern, 'Informe um domínio válido.');
export const TenantDomainTypeSchema = z.enum(['CUSTOM', 'SUBDOMAIN']);
export const CreateTenantDomainRequestSchema = z
  .object({ type: TenantDomainTypeSchema, hostname: TenantHostnameSchema })
  .strict();
export const TenantDomainSchema = z.object({
  publicId: z.uuid(),
  hostname: TenantHostnameSchema,
  type: TenantDomainTypeSchema,
  status: z.enum(['PENDING', 'ACTIVE', 'FAILED']),
  verificationName: z.string(),
  verificationValue: z.string(),
  verifiedAt: z.iso.datetime({ offset: true }).nullable(),
  lastError: z.string().nullable(),
});
export const TenantDomainListResponseSchema = z.object({
  items: z.array(TenantDomainSchema),
  platformBaseDomain: TenantHostnameSchema.nullable(),
});
export const PublicTenantResolutionQuerySchema = z
  .object({ hostname: TenantHostnameSchema })
  .strict();
export const PublicTenantResolutionResponseSchema = z.object({ slug: z.string() });
