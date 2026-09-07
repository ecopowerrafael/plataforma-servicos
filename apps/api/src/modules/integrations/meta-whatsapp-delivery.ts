import { type PrismaClient } from '../../database-client/client.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import {
  IntegrationUnavailableError,
  type WhatsAppControlTest,
  type WhatsAppDelivery,
  type WhatsAppInstanceDiagnostics,
  type WhatsAppInteractiveButton,
  type WhatsAppOperationResult,
  type WhatsAppReplyButtonType,
  type WhatsAppSendOutcome,
} from './integration-delivery.js';
import { type WhatsAppConnectionResult } from './whatsapp-connection.js';
import { MetaWhatsAppClient } from './meta-whatsapp-client.js';
import { META_WHATSAPP_CAPABILITIES } from './meta-whatsapp-connection.js';

export class MetaWhatsAppDelivery implements WhatsAppDelivery {
  public readonly provider = 'META' as const;
  public readonly capabilities = META_WHATSAPP_CAPABILITIES;

  public constructor(
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher | undefined,
    private readonly metaClient = new MetaWhatsAppClient(),
  ) {}

  private async config(tenantId: bigint) {
    const config = await this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId } });
    if (config === null || config.provider !== 'META' || !config.active) {
      throw new IntegrationUnavailableError('Meta WhatsApp nao configurado ou inativo para o tenant.');
    }
    if (this.cipher === undefined) throw new IntegrationUnavailableError('Criptografia de credenciais nao configurada.');
    const stored = this.cipher.decrypt(config.encryptedAccessToken);
    const accessToken = stored.accessToken ?? stored.token;
    if (typeof accessToken !== 'string' || accessToken.trim() === '') {
      throw new IntegrationUnavailableError('Credencial da Meta invalida.');
    }
    return { phoneNumberId: config.phoneNumberId, accessToken, apiVersion: config.apiVersion };
  }

  private async sendPayload(tenantId: bigint, payload: Record<string, unknown>): Promise<WhatsAppSendOutcome> {
    const config = await this.config(tenantId);
    try {
      const response = await this.metaClient.sendMessage(
        config.apiVersion,
        config.phoneNumberId,
        config.accessToken,
        payload,
      );
      const messages = Array.isArray(response.payload.messages) ? response.payload.messages : [];
      const first = messages[0] as Record<string, unknown> | undefined;
      const externalMessageId = typeof first?.id === 'string' ? first.id : null;
      return {
        externalMessageId: response.ok ? externalMessageId : null,
        status: response.ok ? 'SENT' : 'FAILED',
        httpStatus: response.status,
        errorCode: response.ok ? null : String(response.status),
        message: response.ok ? 'Mensagem enviada pela Meta.' : 'A Meta recusou o envio.',
      };
    } catch {
      return {
        externalMessageId: null,
        status: 'FAILED',
        httpStatus: null,
        errorCode: 'NETWORK',
        message: 'Nao foi possivel acessar a Meta.',
      };
    }
  }

  public async send(tenantId: bigint, to: string, text: string): Promise<void> {
    const result = await this.sendPlainText(tenantId, to, text);
    if (result.status === 'FAILED') throw new Error(result.message);
  }

  public sendPlainText(tenantId: bigint, to: string, message: string): Promise<WhatsAppSendOutcome> {
    return this.sendPayload(tenantId, {
      to,
      type: 'text',
      text: { body: message },
    });
  }

  public sendInteractiveButtons(
    tenantId: bigint,
    to: string,
    message: string,
    buttons: WhatsAppInteractiveButton[],
    _replyType?: WhatsAppReplyButtonType,
  ): Promise<WhatsAppSendOutcome> {
    return this.sendPayload(tenantId, {
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: message },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({
            type: 'reply',
            reply: { id: button.buttonId, title: button.label.slice(0, 20) },
          })),
        },
      },
    });
  }

  public async testConnection(tenantId: bigint): Promise<WhatsAppConnectionResult> {
    try {
      await this.config(tenantId);
      return { connected: true, code: 'WHATSAPP_CONNECTED', message: 'Meta configurada.', httpStatus: null, externalCode: null };
    } catch {
      return { connected: false, code: 'WHATSAPP_CREDENTIALS_MISSING', message: 'Meta nao configurada.', httpStatus: null, externalCode: null };
    }
  }

  public configureReceivedWebhook(): Promise<WhatsAppOperationResult> {
    return Promise.resolve({ ok: false, httpStatus: null, externalCode: 'META_WEBHOOK_APP_LEVEL', message: 'Configure o webhook no app da Meta.', externalMessageId: null, queuedId: null });
  }

  public configureStatusWebhook(): Promise<WhatsAppOperationResult> {
    return this.configureReceivedWebhook();
  }

  public inspectInstance(): Promise<WhatsAppInstanceDiagnostics> {
    const probe = { ok: false, httpStatus: null, message: 'Diagnostico Meta ainda nao implementado.', payload: null };
    return Promise.resolve({ instance: probe, queue: probe });
  }

  public runControlTest(tenantId: bigint, to: string, message: string): Promise<WhatsAppControlTest> {
    return this.sendPlainText(tenantId, to, message).then((text) => ({
      phoneCheck: { ok: true, httpStatus: null, message: 'A Meta valida o destinatario no envio.', payload: null },
      text: {
        ok: text.status !== 'FAILED',
        httpStatus: text.httpStatus,
        externalCode: text.errorCode,
        message: text.message,
        externalMessageId: text.externalMessageId,
        queuedId: null,
      },
    }));
  }
}
