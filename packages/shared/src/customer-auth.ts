import { z } from 'zod';

import { CustomerPasswordSchema, EmailSchema } from './auth.js';

const phone = z.string().trim().min(3).max(32);

export const CustomerRegisterRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: EmailSchema,
    phone: phone.nullable().optional(),
    password: CustomerPasswordSchema,
    acceptsCommunications: z.boolean().default(false),
  })
  .strict();

export const CustomerLoginRequestSchema = z
  .object({ email: EmailSchema, password: z.string().min(1).max(128) })
  .strict();

export const CustomerAuthPublicSchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  })
  .strict();

export const CustomerAuthResponseSchema = z.object({ customer: CustomerAuthPublicSchema });

export type CustomerRegisterRequest = z.infer<typeof CustomerRegisterRequestSchema>;
export type CustomerLoginRequest = z.infer<typeof CustomerLoginRequestSchema>;
