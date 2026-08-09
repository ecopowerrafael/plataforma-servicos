import { TenantCustomFieldResponseSchema } from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';

export class TenantCustomFieldsResolver {
  public constructor(private readonly client: PrismaClient) {}

  public async findByTenantPublicId(tenantPublicId: string) {
    const tenant = await this.client.tenant.findUnique({
      where: { publicId: tenantPublicId },
      include: {
        customFields: { orderBy: [{ scope: 'asc' }, { sortOrder: 'asc' }, { key: 'asc' }] },
      },
    });
    if (tenant === null) return null;
    return {
      profile: tenant.businessProfile,
      fields: tenant.customFields.map((field) =>
        TenantCustomFieldResponseSchema.parse({
          publicId: field.publicId,
          key: field.key,
          label: field.label,
          description: field.description,
          type: field.type,
          scope: field.scope,
          required: field.required,
          active: field.active,
          order: field.sortOrder,
          options: field.options ?? undefined,
          validation: field.validation ?? undefined,
          source: field.source,
          createdAt: field.createdAt.toISOString(),
          updatedAt: field.updatedAt.toISOString(),
        }),
      ),
    };
  }
}
