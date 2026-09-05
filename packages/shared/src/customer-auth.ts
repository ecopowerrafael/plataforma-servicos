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
    photoUrl: z.string().nullable(),
    photoUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const CustomerForgotPasswordRequestSchema = z.object({ email: EmailSchema }).strict();
export const CustomerResetPasswordRequestSchema = z
  .object({ token: z.string().min(32).max(256), newPassword: CustomerPasswordSchema })
  .strict();

export const CustomerAuthResponseSchema = z.object({ customer: CustomerAuthPublicSchema });

export const CustomerGoogleAuthRequestSchema = z
  .object({ credential: z.string().min(1).max(10000) })
  .strict();
export const CustomerGoogleAuthResponseSchema = CustomerAuthResponseSchema;

export type CustomerRegisterRequest = z.infer<typeof CustomerRegisterRequestSchema>;
export type CustomerLoginRequest = z.infer<typeof CustomerLoginRequestSchema>;
export type CustomerForgotPasswordRequest = z.infer<typeof CustomerForgotPasswordRequestSchema>;
export type CustomerResetPasswordRequest = z.infer<typeof CustomerResetPasswordRequestSchema>;
