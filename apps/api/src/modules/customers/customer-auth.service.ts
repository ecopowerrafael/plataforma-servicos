import {
  normalizeEmail,
  type CustomerLoginRequest,
  type CustomerRegisterRequest,
} from '@plataforma/shared';

import { type CustomerAuthRepository } from './customer-auth.repository.js';
import { type CustomerRepository } from './customer.repository.js';
import { AppError } from '../../errors/AppError.js';
import { GoogleAuthService } from '../auth/google-auth.service.js';
import { type PasswordService } from '../auth/password.service.js';
import { generateOpaqueToken, generatePublicId, hashOpaqueToken } from '../auth/token.service.js';
import { type EmailDelivery } from '../notifications/email-delivery.js';
import { type TenantWhiteLabelRepository } from '../tenants/tenant-white-label.repository.js';

interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface CustomerAuthResult {
  customer: {
    publicId: string;
    name: string;
    email: string | null;
    phone: string | null;
    photoPath: string | null;
  };
  rawSessionToken: string;
  sessionExpiresAt: Date;
}

let sharedDummyPasswordHash: Promise<string> | undefined;

function tenantNotFound(): AppError {
  return new AppError({
    code: 'PUBLIC_TENANT_NOT_FOUND',
    message: 'Estabelecimento não encontrado.',
    statusCode: 404,
  });
}

function invalidCredentials(): AppError {
  return new AppError({
    code: 'CUSTOMER_AUTH_INVALID_CREDENTIALS',
    message: 'E-mail ou senha inválidos.',
    statusCode: 401,
  });
}

export class CustomerAuthService {
  public constructor(
    private readonly customers: CustomerRepository,
    private readonly sessions: CustomerAuthRepository,
    private readonly tenants: TenantWhiteLabelRepository,
    private readonly passwords: PasswordService,
    private readonly googleAuth: GoogleAuthService,
    private readonly options: {
      sessionTtlHours: number;
      passwordResetTtlMinutes?: number;
      appWebUrl?: string;
    },
    private readonly email?: EmailDelivery,
  ) {}

  /**
   * Resposta sempre neutra: a rota pública não revela se existe conta.
   * Reaproveita o mesmo token opaco + hash usado no reset do staff.
   */
  public async forgotPassword(
    slug: string,
    email: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const tenant = await this.tenants.findActiveTenantBySlug(slug);
    if (tenant === null) return;
    const customer = await this.customers.findByEmail(tenant.id, normalizeEmail(email));
    if (customer?.passwordHash == null) return;
    await this.issuePasswordReset(tenant.id, slug, customer, metadata, 'Redefinição de senha');
  }

  public async provisionFromWhatsApp(
    slug: string,
    input: { name: string; phone: string; email: string },
  ): Promise<{ customer: { id: bigint; publicId: string }; emailSent: boolean }> {
    const tenant = await this.tenants.findActiveTenantBySlug(slug);
    if (tenant === null) throw tenantNotFound();
    const email = normalizeEmail(input.email);
    const byPhone = await this.customers.findByContact(tenant.id, input.phone, null);
    const byEmail = await this.customers.findByEmail(tenant.id, email);
    if (byPhone !== null && byEmail !== null && byPhone.id !== byEmail.id)
      throw new AppError({ code: 'CUSTOMER_EMAIL_CONFLICT', message: 'E-mail já vinculado.', statusCode: 409 });
    const existing = byPhone ?? byEmail;
    const customer = existing === null
      ? await this.customers.create({ publicId: generatePublicId(), tenantId: tenant.id, name: input.name, socialName: null, phone: input.phone, whatsapp: input.phone, email, birthDate: null, document: null, notes: null, status: 'ACTIVE', source: 'PUBLIC_BOOKING', acceptsCommunications: false, primaryUnitId: null, customFields: {}, passwordHash: await this.passwords.hash(generateOpaqueToken()) })
      : await this.customers.update(existing.id, { name: input.name, phone: input.phone, whatsapp: input.phone, email, ...(existing.passwordHash === null ? { passwordHash: await this.passwords.hash(generateOpaqueToken()) } : {}) });
    const emailSent = await this.issuePasswordReset(tenant.id, slug, customer, { ipAddress: null, userAgent: null }, 'Crie sua senha');
    return { customer: { id: customer.id, publicId: customer.publicId }, emailSent };
  }

  public async resetPassword(
    slug: string,
    token: string,
    newPassword: string,
  ): Promise<void> {
    const tenant = await this.tenants.findActiveTenantBySlug(slug);
    if (tenant === null) throw tenantNotFound();
    const changed = await this.sessions.consumePasswordReset(
      tenant.id,
      hashOpaqueToken(token),
      await this.passwords.hash(newPassword),
      new Date(),
    );
    if (!changed)
      throw new AppError({
        code: 'CUSTOMER_PASSWORD_RESET_INVALID',
        message: 'O link de redefinição é inválido, expirou ou já foi utilizado.',
        statusCode: 400,
      });
  }

  public async register(
    slug: string,
    input: CustomerRegisterRequest,
    metadata: RequestMetadata,
  ): Promise<CustomerAuthResult> {
    const tenant = await this.tenants.findActiveTenantBySlug(slug);
    if (tenant === null) throw tenantNotFound();
    const email = normalizeEmail(input.email);
    const phone = input.phone ?? null;
    const existing = await this.customers.findByContact(tenant.id, phone, email);
    if (existing !== null && existing.passwordHash !== null)
      throw new AppError({
        code: 'CUSTOMER_ALREADY_REGISTERED',
        message: 'Já existe um cadastro com este e-mail ou telefone.',
        statusCode: 409,
      });
    const passwordHash = await this.passwords.hash(input.password);
    const customer =
      existing === null
        ? await this.customers.create({
            publicId: generatePublicId(),
            tenantId: tenant.id,
            name: input.name,
            socialName: null,
            phone,
            whatsapp: null,
            email,
            birthDate: null,
            document: null,
            notes: null,
            status: 'ACTIVE',
            source: 'CUSTOMER_PORTAL',
            acceptsCommunications: input.acceptsCommunications,
            passwordHash,
            primaryUnitId: null,
            customFields: {},
          })
        : await this.customers.update(existing.id, {
            name: input.name,
            email,
            phone,
            acceptsCommunications: input.acceptsCommunications,
            passwordHash,
          });
    await this.sessions.audit({
      publicId: generatePublicId(),
      tenantId: tenant.id,
      userId: null,
      sessionId: null,
      action: 'customer.registered',
      targetType: 'customer',
      targetPublicId: customer.publicId,
    });
    return this.createSession(tenant.id, customer, metadata);
  }

  public async login(
    slug: string,
    input: CustomerLoginRequest,
    metadata: RequestMetadata,
  ): Promise<CustomerAuthResult> {
    const tenant = await this.tenants.findActiveTenantBySlug(slug);
    if (tenant === null) throw tenantNotFound();
    const email = normalizeEmail(input.email);
    const customer = await this.customers.findByEmail(tenant.id, email);
    sharedDummyPasswordHash ??= this.passwords.hash(generateOpaqueToken());
    const passwordHash = customer?.passwordHash ?? (await sharedDummyPasswordHash);
    const passwordMatches = await this.passwords.verify(passwordHash, input.password);
    if (customer?.status !== 'ACTIVE' || !passwordMatches) {
      await this.sessions.audit({
        publicId: generatePublicId(),
        tenantId: tenant.id,
        userId: null,
        sessionId: null,
        action: 'customer.login.failure',
        targetType: 'customer',
        targetPublicId: customer?.publicId ?? null,
        metadata: { reason: 'INVALID_CREDENTIALS' },
      });
      throw invalidCredentials();
    }
    if (this.passwords.needsRehash(customer.passwordHash ?? '')) {
      await this.customers.update(customer.id, {
        passwordHash: await this.passwords.hash(input.password),
      });
    }
    return this.createSession(tenant.id, customer, metadata);
  }

  public async authenticate(rawToken: string | undefined) {
    if (rawToken === undefined || rawToken.length < 32)
      throw new AppError({
        code: 'CUSTOMER_AUTH_REQUIRED',
        message: 'Autenticação obrigatória.',
        statusCode: 401,
      });
    const session = await this.sessions.findActiveSessionByTokenHash(hashOpaqueToken(rawToken));
    if (session === null)
      throw new AppError({
        code: 'CUSTOMER_AUTH_REQUIRED',
        message: 'Sessão inválida ou expirada.',
        statusCode: 401,
      });
    await this.sessions.touchSession(session.id, new Date());
    return session;
  }

  public async logout(rawToken: string | undefined, metadata: RequestMetadata) {
    if (rawToken === undefined || rawToken.length < 32) return;
    const session = await this.sessions.findActiveSessionByTokenHash(hashOpaqueToken(rawToken));
    if (session === null) return;
    await this.sessions.revokeSession(session.id, 'LOGOUT');
    await this.sessions.audit({
      publicId: generatePublicId(),
      tenantId: session.tenantId,
      userId: null,
      sessionId: null,
      action: 'customer.logout',
      targetType: 'customer',
      targetPublicId: session.customer.publicId,
      ...metadata,
    });
  }

  public async loginWithGoogle(
    slug: string,
    credential: string,
    metadata: RequestMetadata,
  ): Promise<CustomerAuthResult> {
    const tenant = await this.tenants.findActiveTenantBySlug(slug);
    if (tenant === null) throw tenantNotFound();

    const payload = this.googleAuth.validateIdToken(credential);
    const email = normalizeEmail(payload.email);

    // Look up customer by googleSub first
    let customer = await this.customers.findByGoogleSub(tenant.id, payload.sub);

    if (customer === null) {
      // Try to find existing customer by email to link
      customer = await this.customers.findByEmail(tenant.id, email);

      if (customer !== null && customer.status === 'ACTIVE') {
        // Link googleSub to existing customer
        await this.customers.update(customer.id, { googleSub: payload.sub });
      } else {
        // Create new customer
        customer = await this.customers.create({
          publicId: generatePublicId(),
          tenantId: tenant.id,
          name: payload.name ?? email.split('@')[0] ?? 'Customer',
          socialName: null,
          phone: null,
          whatsapp: null,
          email,
          birthDate: null,
          document: null,
          notes: null,
          status: 'ACTIVE',
          source: 'GOOGLE_LOGIN',
          acceptsCommunications: false,
          passwordHash: null,
          googleSub: payload.sub,
          primaryUnitId: null,
          customFields: {},
        });
      }
    }

    if (customer.status !== 'ACTIVE') {
      throw new AppError({
        code: 'CUSTOMER_INACTIVE',
        message: 'Acesso da cliente está bloqueado.',
        statusCode: 403,
      });
    }

    await this.sessions.audit({
      publicId: generatePublicId(),
      tenantId: tenant.id,
      userId: null,
      sessionId: null,
      action: 'customer.login.success',
      targetType: 'customer',
      targetPublicId: customer.publicId,
      metadata: { provider: 'GOOGLE' },
      ...metadata,
    });

    return this.createSession(tenant.id, customer, metadata);
  }

  private async createSession(
    tenantId: bigint,
    customer: {
      id: bigint;
      publicId: string;
      name: string;
      email: string | null;
      phone: string | null;
      photoPath?: string | null;
    },
    metadata: RequestMetadata,
  ): Promise<CustomerAuthResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlHours * 3_600_000);
    const rawSessionToken = generateOpaqueToken();
    await this.sessions.createSession({
      publicId: generatePublicId(),
      tenantId,
      customerId: customer.id,
      tokenHash: hashOpaqueToken(rawSessionToken),
      expiresAt,
      lastSeenAt: now,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    return {
      customer: {
        publicId: customer.publicId,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        photoPath: customer.photoPath ?? null,
      },
      rawSessionToken,
      sessionExpiresAt: expiresAt,
    };
  }

  private async issuePasswordReset(
    tenantId: bigint,
    slug: string,
    customer: { id: bigint; name: string; email: string | null },
    metadata: RequestMetadata,
    subject: string,
  ): Promise<boolean> {
    const token = generateOpaqueToken();
    await this.sessions.createPasswordReset({ tenantId, customerId: customer.id, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + (this.options.passwordResetTtlMinutes ?? 60) * 60_000), now: new Date(), ipAddress: metadata.ipAddress });
    if (this.email?.available !== true || customer.email === null) return false;
    const link = `${this.options.appWebUrl ?? ''}/public/${slug}/redefinir-senha?token=${encodeURIComponent(token)}`;
    try {
      await this.email.send({ to: customer.email, subject, text: `Olá, ${customer.name}.\n\nSeu cadastro foi criado durante seu agendamento. Para acessar seus agendamentos, crie sua senha no link abaixo:\n${link}\n\nSe você não realizou este agendamento, ignore esta mensagem.` });
      return true;
    } catch { return false; }
  }
}
