import { z } from 'zod';

import { TenantCustomFieldResponseSchema } from './business-profile.js';
import { nullable, phone } from './customer.js';

const profileInput = {
  name: z.string().trim().min(2).max(120),
  socialName: nullable(z.string().trim().min(2).max(120)),
  phone: nullable(phone),
  whatsapp: nullable(phone),
  email: nullable(z.email().trim().max(254)),
  birthDate: nullable(z.iso.date()),
  document: nullable(z.string().trim().min(2).max(80)),
  acceptsCommunications: z.boolean().default(false),
  customFields: z.record(z.string().max(63), z.unknown()).default({}),
};

export const UpdateCustomerProfileRequestSchema = z.object(profileInput).strict();

export const CustomerProfilePublicSchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    socialName: z.string().nullable(),
    phone: z.string().nullable(),
    whatsapp: z.string().nullable(),
    email: z.string().nullable(),
    birthDate: z.iso.date().nullable(),
    document: z.string().nullable(),
    acceptsCommunications: z.boolean(),
    customFields: z.record(z.string(), z.unknown()),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const CustomerProfileResponseSchema = z.object({
  profile: CustomerProfilePublicSchema,
  fields: z.array(TenantCustomFieldResponseSchema),
});

export type UpdateCustomerProfileRequest = z.infer<typeof UpdateCustomerProfileRequestSchema>;
