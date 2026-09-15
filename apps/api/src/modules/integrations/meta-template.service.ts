import { randomUUID } from 'node:crypto';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { AGENDEI_META_TEMPLATES, type MetaTemplateDefinition } from './meta-template-catalog.js';
import { MetaWhatsAppClient } from './meta-whatsapp-client.js';

type TemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'UNKNOWN';

const STATUS_LABEL: Record<TemplateStatus, string> = {
  PENDING: 'Em análise',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  PAUSED: 'Pausado',
  DISABLED: 'Desativado',
  UNKNOWN: 'Status desconhecido',
};

const allowedStatus = new Set(['PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'UNKNOWN']);

type MetaConfig = NonNullable<Awaited<ReturnType<PrismaClient['tenantWhatsAppConfig']['findUnique']>>>;
type LocalTemplate = NonNullable<Awaited<ReturnType<PrismaClient['tenantWhatsAppMetaTemplate']['findFirst']>>>;
type MetaTemplateRemote = {
  id: string | null;
  name: string;
  language: string;
  category: string;
  status: TemplateStatus;
  rejectionReason: string | null;
};

type CreateTemplateResult =
  | { ok: true; remote: MetaTemplateRemote }
  | { ok: false; failure: { code: string; message: string; statusCode: number } };

export class MetaTemplateService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher | undefined,
    private readonly metaClient = new MetaWhatsAppClient(),
  ) {}

  public async list(tenantId: bigint) {
    const config = await this.metaConfig(tenantId);
    const local = await this.client.tenantWhatsAppMetaTemplate.findMany({
      where: { tenantId },
      orderBy: { templateName: 'asc' },
    });
    return { items: this.catalogView(local, config) };
  }

  public async provisionDefaults(tenantId: bigint) {
    const config = await this.metaConfig(tenantId);
    const { accessToken } = this.credentials(config);
    const remote = await this.remoteTemplates(config, accessToken);
    const now = new Date();
    const summary = { requested: AGENDEI_META_TEMPLATES.length, created: 0, existing: 0, failed: 0 };

    for (const definition of AGENDEI_META_TEMPLATES) {
      const existingRemote = remote.get(this.key(definition.name, definition.language));
      if (existingRemote !== undefined) {
        summary.existing += 1;
        await this.upsertLocal(tenantId, config.id, definition, existingRemote, now);
        continue;
      }
      const local = await this.client.tenantWhatsAppMetaTemplate.findFirst({
        where: { tenantId, purpose: definition.purpose, templateName: definition.name },
      });
      if (local !== null && local.metaTemplateId !== null) {
        summary.existing += 1;
        await this.markUnknown(local.id, now);
        continue;
      }
      const created = await this.createRemote(config, accessToken, definition);
      if (!created.ok) {
        summary.failed += 1;
        await this.upsertLocal(tenantId, config.id, definition, {
          id: local?.metaTemplateId ?? null,
          name: definition.name,
          language: definition.language,
          category: definition.category,
          status: 'UNKNOWN',
          rejectionReason: created.failure.message,
        }, now);
        continue;
      }
      summary.created += 1;
      await this.upsertLocal(tenantId, config.id, definition, created.remote, now);
    }

    return { ...(await this.list(tenantId)), summary };
  }

  public async refresh(tenantId: bigint) {
    const config = await this.metaConfig(tenantId);
    const { accessToken } = this.credentials(config);
    const remote = await this.remoteTemplates(config, accessToken);
    const now = new Date();
    for (const definition of AGENDEI_META_TEMPLATES) {
      const found = remote.get(this.key(definition.name, definition.language));
      const local = await this.client.tenantWhatsAppMetaTemplate.findFirst({
        where: { tenantId, purpose: definition.purpose, templateName: definition.name },
      });
      if (found !== undefined) await this.upsertLocal(tenantId, config.id, definition, found, now);
      else if (local !== null) await this.markUnknown(local.id, now);
    }
    return this.list(tenantId);
  }

  private async metaConfig(tenantId: bigint): Promise<MetaConfig> {
    const config = await this.client.tenantWhatsAppConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'META' } },
    });
    if (config === null || config.provider !== 'META') {
      throw new AppError({ code: 'META_WHATSAPP_NOT_CONFIGURED', message: 'Configure a Meta Cloud API antes de provisionar templates.', statusCode: 400 });
    }
    if (config.businessAccountId.trim() === '' || config.encryptedAccessToken.trim() === '') {
      throw new AppError({ code: 'META_WHATSAPP_CREDENTIALS_REQUIRED', message: 'Informe WABA e Access Token da Meta.', statusCode: 400 });
    }
    if (this.cipher === undefined) {
      throw new AppError({ code: 'CREDENTIAL_ENCRYPTION_NOT_CONFIGURED', message: 'A criptografia de credenciais não está configurada.', statusCode: 503 });
    }
    return config;
  }

  private credentials(config: MetaConfig) {
    if (this.cipher === undefined) throw new Error('cipher unavailable');
    const stored = this.cipher.decrypt(config.encryptedAccessToken);
    const accessToken = stored.accessToken ?? stored.token;
    if (typeof accessToken !== 'string' || accessToken.trim() === '') {
      throw new AppError({ code: 'META_WHATSAPP_CREDENTIALS_REQUIRED', message: 'Access Token da Meta não configurado.', statusCode: 400 });
    }
    return { accessToken };
  }

  private async remoteTemplates(config: MetaConfig, accessToken: string) {
    const response = await this.metaClient.listTemplates(config.apiVersion, config.businessAccountId, accessToken);
    if (!response.ok) throw this.metaError(response.status);
    const data = Array.isArray(response.payload.data) ? response.payload.data : [];
    return new Map(data.map((item) => this.remote(item)).filter((item): item is MetaTemplateRemote => item !== null).map((item) => [this.key(item.name, item.language), item]));
  }

  private async createRemote(config: MetaConfig, accessToken: string, definition: MetaTemplateDefinition) {
    const response = await this.metaClient.createTemplate(config.apiVersion, config.businessAccountId, accessToken, this.payload(definition));
    if (!response.ok) return { ok: false, failure: this.createError(response.status) } satisfies CreateTemplateResult;
    return {
      ok: true,
      remote: {
        id: typeof response.payload.id === 'string' ? response.payload.id : null,
        name: definition.name,
        language: definition.language,
        category: definition.category,
        status: this.status(typeof response.payload.status === 'string' ? response.payload.status : 'PENDING'),
        rejectionReason: null,
      },
    } satisfies CreateTemplateResult;
  }

  private payload(definition: MetaTemplateDefinition) {
    const body: Record<string, unknown> = {
      type: 'BODY',
      text: definition.body,
      example: { body_text: [definition.examples] },
    };
    const components: Record<string, unknown>[] = [body];
    if (definition.buttons !== undefined) {
      components.push({
        type: 'BUTTONS',
        buttons: definition.buttons.map((button) => ({ type: button.type, text: button.text })),
      });
    }
    return { name: definition.name, language: definition.language, category: definition.category, components };
  }

  private remote(item: unknown): MetaTemplateRemote | null {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (typeof record.name !== 'string' || typeof record.language !== 'string') return null;
    return {
      id: typeof record.id === 'string' ? record.id : null,
      name: record.name,
      language: record.language,
      category: typeof record.category === 'string' ? record.category : 'UNKNOWN',
      status: this.status(typeof record.status === 'string' ? record.status : 'UNKNOWN'),
      rejectionReason: typeof record.rejected_reason === 'string' ? record.rejected_reason.slice(0, 500) : null,
    };
  }

  private upsertLocal(tenantId: bigint, whatsappConfigId: bigint, definition: MetaTemplateDefinition, remote: MetaTemplateRemote, now: Date) {
    return this.client.tenantWhatsAppMetaTemplate.upsert({
      where: { tenantId_purpose_templateName: { tenantId, purpose: definition.purpose, templateName: definition.name } },
      create: {
        publicId: randomUUID(),
        tenantId,
        whatsappConfigId,
        purpose: definition.purpose,
        templateName: definition.name,
        language: remote.language,
        category: remote.category,
        metaTemplateId: remote.id,
        status: remote.status,
        rejectionReason: remote.rejectionReason,
        lastCheckedAt: now,
      },
      update: {
        whatsappConfigId,
        language: remote.language,
        category: remote.category,
        metaTemplateId: remote.id,
        status: remote.status,
        rejectionReason: remote.rejectionReason,
        lastCheckedAt: now,
      },
    });
  }

  private markUnknown(id: bigint, now: Date) {
    return this.client.tenantWhatsAppMetaTemplate.update({
      where: { id },
      data: { status: 'UNKNOWN', lastCheckedAt: now },
    });
  }

  private catalogView(local: LocalTemplate[], config: MetaConfig) {
    return AGENDEI_META_TEMPLATES.map((definition) => {
      const found = local.find((item) => item.purpose === definition.purpose && item.templateName === definition.name && item.tenantId === config.tenantId);
      const status = this.status(found?.status ?? 'UNKNOWN');
      return {
        publicId: found?.publicId ?? null,
        purpose: definition.purpose,
        friendlyName: definition.friendlyName,
        templateName: definition.name,
        language: found?.language ?? definition.language,
        category: found?.category ?? definition.category,
        metaTemplateId: found?.metaTemplateId ?? null,
        status,
        statusLabel: STATUS_LABEL[status],
        rejectionReason: found?.rejectionReason ?? null,
        lastCheckedAt: found?.lastCheckedAt?.toISOString() ?? null,
        exists: found !== undefined,
      };
    });
  }

  private status(value: string): TemplateStatus {
    const normalized = value.toUpperCase();
    return allowedStatus.has(normalized) ? normalized as TemplateStatus : 'UNKNOWN';
  }

  private key(name: string, language: string) {
    return `${name}:${language}`;
  }

  private metaError(status: number) {
    const code = status === 429 ? 'META_RATE_LIMIT' : status === 401 || status === 403 ? 'META_AUTH_FAILED' : status >= 500 ? 'META_UNAVAILABLE' : 'META_TEMPLATE_SYNC_FAILED';
    const message = status === 429 ? 'A Meta limitou temporariamente as chamadas. Tente novamente em alguns minutos.' : 'Não foi possível sincronizar templates com a Meta.';
    return new AppError({ code, message, statusCode: status === 429 ? 429 : 502 });
  }

  private createError(status: number) {
    if (status === 401 || status === 403) {
      return {
        code: 'META_AUTH_FAILED',
        message: 'Credenciais Meta sem permissão para criar templates.',
        statusCode: 403,
      };
    }
    if (status === 429) {
      return {
        code: 'META_RATE_LIMIT',
        message: 'Limite temporário da Meta atingido.',
        statusCode: 429,
      };
    }
    if (status === 400 || status === 422) {
      return {
        code: 'META_TEMPLATE_INVALID',
        message: 'Meta rejeitou a criação do template.',
        statusCode: 400,
      };
    }
    if (status >= 500) {
      return {
        code: 'META_UNAVAILABLE',
        message: 'Meta indisponível temporariamente.',
        statusCode: 502,
      };
    }
    return {
      code: 'META_TEMPLATE_CREATE_FAILED',
      message: 'Falha ao criar template na Meta.',
      statusCode: 502,
    };
  }
}
