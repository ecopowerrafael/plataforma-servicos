import { randomUUID } from 'node:crypto';

import {
  CustomerProfileResponseSchema,
  type UpdateCustomerProfileRequest,
} from '@plataforma/shared';

import { type CustomerRepository } from './customer.repository.js';
import { type CustomerService } from './customer.service.js';
import { Prisma, type Customer } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

const publicValue = (customer: Customer) => ({
  publicId: customer.publicId,
  name: customer.name,
  socialName: customer.socialName,
  phone: customer.phone,
  whatsapp: customer.whatsapp,
  email: customer.email,
  birthDate: customer.birthDate?.toISOString().slice(0, 10) ?? null,
  document: customer.document,
  acceptsCommunications: customer.acceptsCommunications,
  customFields: (customer.customFields as Record<string, unknown> | null) ?? {},
  createdAt: customer.createdAt.toISOString(),
  updatedAt: customer.updatedAt.toISOString(),
});

export class CustomerProfileService {
  public constructor(
    private readonly customers: CustomerRepository,
    private readonly customerService: CustomerService,
  ) {}

  public async get(tenantId: bigint, customer: Customer) {
    const { fields } = await this.customerService.customFields(tenantId);
    return CustomerProfileResponseSchema.parse({ profile: publicValue(customer), fields });
  }

  public async update(tenantId: bigint, customer: Customer, input: UpdateCustomerProfileRequest) {
    await this.validateCustomFields(tenantId, input.customFields);
    let updated: Customer;
    try {
      updated = await this.customers.update(customer.id, {
        name: input.name,
        socialName: input.socialName ?? null,
        phone: input.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        email: input.email ?? null,
        birthDate:
          input.birthDate === null || input.birthDate === undefined
            ? null
            : new Date(`${input.birthDate}T00:00:00.000Z`),
        document: input.document ?? null,
        acceptsCommunications: input.acceptsCommunications,
        customFields: input.customFields as Prisma.InputJsonValue,
      });
    } catch (error) {
      this.conflict(error);
    }
    await this.customers.audit({
      publicId: randomUUID(),
      tenantId,
      userId: null,
      sessionId: null,
      action: 'customer.profile_updated',
      targetType: 'customer',
      targetPublicId: customer.publicId,
    });
    const { fields } = await this.customerService.customFields(tenantId);
    return CustomerProfileResponseSchema.parse({ profile: publicValue(updated), fields });
  }

  private async validateCustomFields(tenantId: bigint, values: Record<string, unknown>) {
    const fields = await this.customers.fields(tenantId);
    const available = new Map(
      fields.filter((field) => field.active).map((field) => [field.key, field]),
    );
    for (const key of Object.keys(values)) {
      if (!available.has(key))
        throw new AppError({
          code: 'CUSTOMER_CUSTOM_FIELD_UNKNOWN',
          message: 'Campo adicional indisponível.',
          statusCode: 400,
        });
    }
    for (const field of fields) {
      if (field.required && field.active && values[field.key] === undefined)
        throw new AppError({
          code: 'CUSTOMER_CUSTOM_FIELD_REQUIRED',
          message: 'Preencha os campos obrigatórios.',
          statusCode: 400,
        });
    }
  }

  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new AppError({
        code: 'CUSTOMER_PROFILE_CONFLICT',
        message: 'Já existe um cadastro com este e-mail ou telefone.',
        statusCode: 409,
        cause: error,
      });
    throw error;
  }
}
