import { z } from 'zod';

import {
  CreateTenantRequestSchema,
  CreateTenantResponseSchema,
  TenantPublicSchema,
} from './tenant.js';

const commonPasswords = new Set(['1234567890', 'password123', 'senha12345', 'qwerty12345']);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const EmailSchema = z
  .string()
  .trim()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u, 'Informe um e-mail válido.');
export const NormalizedEmailSchema = EmailSchema.transform(normalizeEmail);
export const PasswordSchema = z
  .string()
  .min(10, 'A senha deve possuir pelo menos 10 caracteres.')
  .max(128, 'A senha deve possuir no máximo 128 caracteres.')
  .refine((value) => /\p{L}/u.test(value), 'A senha deve conter ao menos uma letra.')
  .refine((value) => /\d/u.test(value), 'A senha deve conter ao menos um número.')
  .refine((value) => value.trim().length > 0, 'A senha não pode conter somente espaços.')
  .refine((value) => !commonPasswords.has(value.toLowerCase()), 'Escolha uma senha menos comum.');

export const UserStatusSchema = z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'INACTIVE']);
export const MembershipStatusSchema = z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'INACTIVE']);
export const InvitationStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']);
export const SystemRoleCodeSchema = z.enum(['OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL']);
export const AssignableRoleCodeSchema = z.enum(['MANAGER', 'RECEPTIONIST', 'PROFESSIONAL']);

export const PermissionCodeSchema = z.enum([
  'tenant.read',
  'tenant.update',
  'tenant.branding.read',
  'tenant.branding.manage',
  'tenant.subscription.read',
  'unit.read',
  'unit.create',
  'unit.update',
  'membership.read',
  'membership.invite',
  'membership.update',
  'membership.suspend',
  'role.read',
  'role.manage',
  'session.read_own',
  'session.revoke_own',
  'audit.read',
  'service.read',
  'service.create',
  'service.update',
  'service.status.manage',
  'service.image.manage',
  'service.category.read',
  'service.category.create',
  'service.category.update',
  'service.category.status.manage',
  'service.variation.read',
  'service.variation.manage',
  'combo.read',
  'combo.create',
  'combo.update',
  'combo.status.manage',
  'combo.image.manage',
  'professional.read',
  'professional.create',
  'professional.update',
  'professional.status.manage',
  'professional.image.manage',
  'professional.service.read',
  'professional.service.manage',
  'professional.unit.read',
  'professional.unit.manage',
  'professional.schedule.read',
  'professional.schedule.manage',
  'professional.unavailability.read',
  'professional.unavailability.manage',
  'customer.read',
  'customer.create',
  'customer.update',
  'customer.status.manage',
  'calendar.read',
  'availability.read',
  'appointment.read',
  'appointment.create',
  'appointment.update',
  'appointment.status.manage',
  'appointment.fit_in.manage',
  'appointment.checkin.manage',
  'professional.self.read',
  'professional.self.update',
  'notification.read',
  'notification.template.manage',
  'payment.read',
  'payment.manage',
  'cash.read',
  'cash.manage',
  'commission.read',
  'financial_closing.read',
  'financial_closing.manage',
  'financial_report.read',
  'payment_gateway.read',
  'payment_gateway.manage',
  'automation.read',
  'automation.manage',
]);

export const UserPublicSchema = z.object({
  publicId: z.uuid(),
  email: EmailSchema,
  status: UserStatusSchema,
});

export const AvailableTenantSchema = z.object({
  tenant: TenantPublicSchema,
  membership: z.object({
    publicId: z.uuid(),
    roleCode: SystemRoleCodeSchema.or(z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/u)),
  }),
});

export const SessionPublicSchema = z.object({
  publicId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  lastSeenAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  current: z.boolean(),
});

export const AuthenticatedTenantSchema = AvailableTenantSchema.extend({
  membership: AvailableTenantSchema.shape.membership.extend({
    permissions: z.array(PermissionCodeSchema),
    unitPublicIds: z.array(z.uuid()).nullable().optional(),
  }),
});

export const LoginRequestSchema = z
  .object({ email: EmailSchema, password: z.string().min(1).max(128) })
  .strict();
export const LoginResponseSchema = z.object({
  user: UserPublicSchema,
  tenants: z.array(AvailableTenantSchema),
  requiresTenantSelection: z.boolean(),
});
export const AuthMeResponseSchema = LoginResponseSchema.extend({
  session: SessionPublicSchema,
  currentTenant: AuthenticatedTenantSchema.nullable(),
});
export const AuthSessionsResponseSchema = z.object({ sessions: z.array(SessionPublicSchema) });
export const SuccessResponseSchema = z.object({ success: z.literal(true) });

export const ForgotPasswordRequestSchema = z.object({ email: EmailSchema }).strict();
export const ForgotPasswordResponseSchema = z.object({
  message: z.literal('Se o e-mail estiver cadastrado, as instruções serão enviadas.'),
});
export const ResetPasswordRequestSchema = z
  .object({ token: z.string().min(32).max(256), newPassword: PasswordSchema })
  .strict();

export const CreateInvitationRequestSchema = z
  .object({ email: EmailSchema, roleCode: AssignableRoleCodeSchema })
  .strict();
export const InvitationPublicSchema = z.object({
  publicId: z.uuid(),
  email: EmailSchema,
  roleCode: AssignableRoleCodeSchema,
  status: InvitationStatusSchema,
  expiresAt: z.iso.datetime({ offset: true }),
});
export const InvitationListResponseSchema = z.object({
  invitations: z.array(InvitationPublicSchema),
});
export const AcceptInvitationRequestSchema = z
  .object({
    token: z.string().min(32).max(256),
    password: PasswordSchema.optional(),
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .strict();

export const MembershipPublicSchema = z.object({
  publicId: z.uuid(),
  user: UserPublicSchema,
  roleCode: SystemRoleCodeSchema.or(z.string()),
  status: MembershipStatusSchema,
  isOwner: z.boolean(),
  joinedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  unitPublicIds: z.array(z.uuid()).nullable().optional(),
});
export const MembershipListResponseSchema = z.object({ members: z.array(MembershipPublicSchema) });
export const MembershipListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    email: z.string().trim().min(1).max(254).optional(),
    roleCode: SystemRoleCodeSchema.optional(),
    status: MembershipStatusSchema.optional(),
    orderBy: z.enum(['createdAt', 'email', 'roleCode', 'status']).default('createdAt'),
    direction: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
export const MembershipPageSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const MembershipListPaginatedResponseSchema = z.object({
  members: z.array(MembershipPublicSchema),
  page: MembershipPageSchema,
});
export const UpdateMembershipRequestSchema = z
  .object({
    roleCode: AssignableRoleCodeSchema.optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']).optional(),
    unitPublicIds: z.array(z.uuid()).max(100).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.roleCode !== undefined ||
      value.status !== undefined ||
      value.unitPublicIds !== undefined,
    {
      message: 'Informe ao menos uma alteração.',
    },
  );

export const CreateTenantWithOwnerRequestSchema = CreateTenantRequestSchema.extend({
  owner: z.object({ email: EmailSchema, password: PasswordSchema }).strict(),
}).strict();
export const CreateTenantWithOwnerResponseSchema = CreateTenantResponseSchema.extend({
  owner: UserPublicSchema,
  membershipPublicId: z.uuid(),
});

export const AuthErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'AUTH_INVALID_CREDENTIALS',
  'SESSION_INVALID',
  'SESSION_EXPIRED',
  'USER_INACTIVE',
  'TENANT_ACCESS_DENIED',
  'MEMBERSHIP_INACTIVE',
  'PERMISSION_DENIED',
  'SESSION_NOT_FOUND',
  'PASSWORD_RESET_INVALID',
  'INVITATION_INVALID',
  'INVITATION_CONFLICT',
  'MEMBERSHIP_CONFLICT',
  'OWNER_PROTECTED',
  'RATE_LIMITED',
  'CSRF_ORIGIN_INVALID',
]);

export type UserStatus = z.infer<typeof UserStatusSchema>;
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;
export type SystemRoleCode = z.infer<typeof SystemRoleCodeSchema>;
export type AssignableRoleCode = z.infer<typeof AssignableRoleCodeSchema>;
export type PermissionCode = z.infer<typeof PermissionCodeSchema>;
export type UserPublic = z.infer<typeof UserPublicSchema>;
export type AvailableTenant = z.infer<typeof AvailableTenantSchema>;
export type SessionPublic = z.infer<typeof SessionPublicSchema>;
export type AuthenticatedTenant = z.infer<typeof AuthenticatedTenantSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;
export type InvitationPublic = z.infer<typeof InvitationPublicSchema>;
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequestSchema>;
export type MembershipPublic = z.infer<typeof MembershipPublicSchema>;
export type UpdateMembershipRequest = z.infer<typeof UpdateMembershipRequestSchema>;
export type CreateTenantWithOwnerRequest = z.infer<typeof CreateTenantWithOwnerRequestSchema>;
export type CreateTenantWithOwnerResponse = z.infer<typeof CreateTenantWithOwnerResponseSchema>;
