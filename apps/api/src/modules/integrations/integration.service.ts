import { randomUUID } from 'node:crypto';

import { type IntegrationRepository } from './integration.repository.js';
import { AppError } from '../../errors/AppError.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
const whatsappPublic = (
  item: {
    active: boolean;
    phoneNumberId: string;
    businessAccountId: string;
    apiVersion: string;
  } | null,
) => ({
  configured: item !== null,
  active: item?.active ?? false,
  phoneNumberId: item?.phoneNumberId ?? null,
  businessAccountId: item?.businessAccountId ?? null,
  apiVersion: item?.apiVersion ?? null,
});
const externalPublic = (item: {
  publicId: string;
  name: string;
  endpoint: string;
  events: unknown;
  active: boolean;
  encryptedSecret: string | null;
}) => ({
  publicId: item.publicId,
  name: item.name,
  endpoint: item.endpoint,
  events: Array.isArray(item.events) ? item.events : [],
  active: item.active,
  hasSecret: item.encryptedSecret !== null,
});

export class IntegrationService {
  public constructor(
    private readonly repository: IntegrationRepository,
    private readonly cipher: CredentialsCipher | undefined,
  ) {}
  public async whatsapp(tenantId: bigint) {
    return whatsappPublic(await this.repository.whatsapp(tenantId));
  }
  public async updateWhatsapp(
    tenantId: bigint,
    input: {
      active: boolean;
      phoneNumberId: string;
      businessAccountId: string;
      accessToken?: string | undefined;
      apiVersion: string;
    },
    actor: Actor,
  ) {
    const old = await this.repository.whatsapp(tenantId);
    const encryptedAccessToken =
      input.accessToken === undefined
        ? old?.encryptedAccessToken
        : this.encrypt({ accessToken: input.accessToken });
    if (encryptedAccessToken === undefined)
      throw new AppError({
        code: 'WHATSAPP_TOKEN_REQUIRED',
        message: 'Informe o token de acesso para configurar o WhatsApp.',
        statusCode: 400,
      });
    const result = await this.repository.upsertWhatsapp(tenantId, {
      active: input.active,
      phoneNumberId: input.phoneNumberId,
      businessAccountId: input.businessAccountId,
      encryptedAccessToken,
      apiVersion: input.apiVersion,
    });
    await this.audit(tenantId, actor, 'integration.whatsapp.updated', result.publicId);
    return whatsappPublic(result);
  }
  public async list(tenantId: bigint) {
    return { items: (await this.repository.integrations(tenantId)).map(externalPublic) };
  }
  public async save(
    tenantId: bigint,
    publicId: string | null,
    input: {
      name: string;
      endpoint: string;
      secret?: string | null | undefined;
      events: string[];
      active: boolean;
    },
    actor: Actor,
  ) {
    const old = publicId === null ? null : await this.repository.integration(tenantId, publicId);
    if (publicId !== null && old === null)
      throw new AppError({
        code: 'INTEGRATION_NOT_FOUND',
        message: 'Integração não encontrada.',
        statusCode: 404,
      });
    const encryptedSecret =
      input.secret === undefined
        ? (old?.encryptedSecret ?? null)
        : input.secret === null
          ? null
          : this.encrypt({ secret: input.secret });
    const result = await this.repository.upsertIntegration(tenantId, publicId, {
      name: input.name,
      endpoint: input.endpoint,
      encryptedSecret,
      events: input.events,
      active: input.active,
    });
    await this.audit(tenantId, actor, 'integration.external.updated', result.publicId);
    return externalPublic(result);
  }
  public async remove(tenantId: bigint, publicId: string, actor: Actor) {
    const item = await this.repository.integration(tenantId, publicId);
    if (item === null)
      throw new AppError({
        code: 'INTEGRATION_NOT_FOUND',
        message: 'Integração não encontrada.',
        statusCode: 404,
      });
    await this.repository.removeIntegration(item.id);
    await this.audit(tenantId, actor, 'integration.external.removed', publicId);
  }
  private encrypt(value: Record<string, unknown>) {
    if (this.cipher === undefined)
      throw new AppError({
        code: 'CREDENTIAL_ENCRYPTION_NOT_CONFIGURED',
        message: 'A criptografia de credenciais não está configurada.',
        statusCode: 503,
      });
    return this.cipher.encrypt(value);
  }
  private async audit(tenantId: bigint, actor: Actor, action: string, targetPublicId: string) {
    await this.repository.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'external_integration',
      targetPublicId,
    });
  }
}
