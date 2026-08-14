import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { mapWapiConnectionResponse, mapWapiTransportError, type WhatsAppConnectionResult } from './whatsapp-connection.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

export class IntegrationUnavailableError extends Error {}

function credentials(cipher: CredentialsCipher | undefined, payload: string): Record<string, unknown> {
  if (cipher === undefined)
    throw new IntegrationUnavailableError('Criptografia de credenciais nao configurada.');
  return cipher.decrypt(payload);
}

export function privateAddress(address: string): boolean {
  return /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fc|fd)/iu.test(
    address,
  );
}

export interface WhatsAppInteractiveButton {
  buttonId: string;
  label: string;
}

/** Resultado sanitizado de uma chamada de escrita na API do WhatsApp. */
export interface WhatsAppOperationResult {
  ok: boolean;
  httpStatus: number | null;
  externalCode: string | null;
  message: string;
  externalMessageId: string | null;
}

export interface WhatsAppDelivery {
  send(tenantId: bigint, to: string, text: string): Promise<void>;
  testConnection(tenantId: bigint, input?: {instanceId?:string|undefined;token?:string|undefined}): Promise<WhatsAppConnectionResult>;
  sendInteractiveButtons(
    tenantId: bigint,
    to: string,
    message: string,
    buttons: WhatsAppInteractiveButton[],
  ): Promise<WhatsAppOperationResult>;
  configureReceivedWebhook(tenantId: bigint, url: string): Promise<WhatsAppOperationResult>;
}

const sanitizeExternalText = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/Bearer\s+\S+/giu, '[protegido]')
        .replace(/[A-Za-z0-9_-]{40,}/gu, '[protegido]')
        .slice(0, 240)
    : null;

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Traduz a resposta bruta do provedor para um resultado sanitizado. O erro real
 * é preservado (status HTTP, código e mensagem), nunca substituído por um texto
 * genérico — sem fallback silencioso.
 */
async function mapOperationResponse(
  response: Response,
  successMessage: string,
): Promise<WhatsAppOperationResult> {
  const payload = await readJsonObject(response);
  const nested =
    payload.data !== null && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : {};
  const externalCode = sanitizeExternalText(payload.code ?? payload.errorCode ?? payload.error);
  const externalMessage = sanitizeExternalText(payload.message ?? payload.error);
  const externalMessageId = sanitizeExternalText(
    payload.messageId ?? payload.id ?? nested.messageId ?? nested.id,
  );
  if (!response.ok || payload.error === true)
    return {
      ok: false,
      httpStatus: response.status,
      externalCode,
      message:
        externalMessage ??
        `O WhatsApp respondeu HTTP ${String(response.status)} sem detalhamento.`,
      externalMessageId: null,
    };
  return {
    ok: true,
    httpStatus: response.status,
    externalCode,
    message: externalMessage ?? successMessage,
    externalMessageId,
  };
}

function mapOperationTransportError(error: unknown): WhatsAppOperationResult {
  const timeout =
    error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
  return {
    ok: false,
    httpStatus: null,
    externalCode: null,
    message: timeout
      ? 'A chamada demorou mais que o esperado. Tente novamente.'
      : 'Não foi possível acessar o serviço do WhatsApp. Verifique a rede e tente novamente.',
    externalMessageId: null,
  };
}

export class WApiWhatsAppDelivery implements WhatsAppDelivery {
  public constructor(
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async config(tenantId: bigint, requireActive: boolean) {
    try {
      await new PlanEntitlementService().assertFeatureEnabledForTenant(
        this.client,
        tenantId,
        'whatsapp.enabled',
      );
    } catch {
      throw new IntegrationUnavailableError('WhatsApp indisponivel no plano atual.');
    }
    const config = await this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId } });
    if (config === null || (requireActive && !config.active))
      throw new IntegrationUnavailableError('WhatsApp nao configurado ou inativo para o tenant.');
    const stored = credentials(this.cipher, config.encryptedAccessToken);
    const token = stored.token ?? stored.accessToken;
    if (typeof token !== 'string' || token.trim() === '')
      throw new IntegrationUnavailableError('Credencial do WhatsApp invalida.');
    return { instanceId: config.phoneNumberId, token };
  }

  public async send(tenantId: bigint, to: string, text: string): Promise<void> {
    const { instanceId, token } = await this.config(tenantId, true);
    const response = await fetch(
      `https://api.w-api.app/v1/message/send-text?instanceId=${encodeURIComponent(instanceId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: to, message: text }),
      },
    );
    if ([401, 403, 404].includes(response.status))
      throw new IntegrationUnavailableError('Configuracao do WhatsApp invalida.');
    if (!response.ok)
      throw new Error(`Falha temporaria no envio (HTTP ${String(response.status)}).`);
  }

  /**
   * Envia mensagem com botões de resposta.
   * Endpoint e corpo conforme a coleção oficial (`Mensagens › Enviar texto com botões`).
   */
  public async sendInteractiveButtons(
    tenantId: bigint,
    to: string,
    message: string,
    buttons: WhatsAppInteractiveButton[],
  ): Promise<WhatsAppOperationResult> {
    const { instanceId, token } = await this.config(tenantId, true);
    try {
      const response = await this.fetcher(
        `https://api.w-api.app/v1/message/send-button-list?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: to,
            message,
            buttons: buttons.map(({ buttonId, label }) => ({ buttonId, label })),
            delayMessage: 0,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      return await mapOperationResponse(response, 'Mensagem com botões enviada.');
    } catch (error) {
      return mapOperationTransportError(error);
    }
  }

  /** Registra a URL que receberá as mensagens recebidas pela instância. */
  public async configureReceivedWebhook(
    tenantId: bigint,
    url: string,
  ): Promise<WhatsAppOperationResult> {
    const { instanceId, token } = await this.config(tenantId, false);
    try {
      const response = await this.fetcher(
        `https://api.w-api.app/v1/webhook/update-webhook-received?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: url }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      return await mapOperationResponse(response, 'Webhook configurado na instância.');
    } catch (error) {
      return mapOperationTransportError(error);
    }
  }

  public async testConnection(tenantId: bigint,input: {instanceId?:string|undefined;token?:string|undefined} = {}): Promise<WhatsAppConnectionResult> {
    await new PlanEntitlementService().assertFeatureEnabledForTenant(this.client,tenantId,'whatsapp.enabled');
    let stored:{instanceId:string;token:string};
    try{stored=await this.config(tenantId,false);}catch{if(input.instanceId&&input.token)stored={instanceId:input.instanceId,token:input.token};else return{connected:false,code:'WHATSAPP_CREDENTIALS_MISSING',message:'Informe o ID da instância e o Token do WPP.',httpStatus:null,externalCode:null};}
    const instanceId=input.instanceId?.trim()??stored.instanceId;const token=input.token?.trim()??stored.token;
    if(!instanceId||!token)return{connected:false,code:'WHATSAPP_CREDENTIALS_MISSING',message:'Informe o ID da instância e o Token do WPP.',httpStatus:null,externalCode:null};
    try{const response=await this.fetcher(`https://api.w-api.app/v1/instance/status-instance?instanceId=${encodeURIComponent(instanceId)}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8_000)});return await mapWapiConnectionResponse(response);}catch(error){return mapWapiTransportError(error);}
  }
}

export class WebhookDelivery {
  public constructor(
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher | undefined,
  ) {}
  public async send(
    tenantId: bigint,
    integrationPublicId: string,
    body: string,
    idempotencyKey: string,
  ): Promise<void> {
    const config = await this.client.externalIntegration.findFirst({
      where: { tenantId, publicId: integrationPublicId, active: true },
    });
    if (config === null)
      throw new IntegrationUnavailableError('Integracao externa nao encontrada ou inativa.');
    const url = new URL(config.endpoint);
    if (url.protocol !== 'https:' || url.hostname === 'localhost' || isIP(url.hostname) !== 0)
      throw new Error('Endpoint externo nao permitido.');
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.some(({ address }) => privateAddress(address)))
      throw new Error('Endpoint externo resolve para rede privada.');
    const secret = config.encryptedSecret === null ? null : credentials(this.cipher, config.encryptedSecret).secret;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    };
    if (typeof secret === 'string')
      headers['x-plataforma-signature'] = createHmac('sha256', secret).update(body).digest('hex');
    const response = await fetch(url, { method: 'POST', headers, body });
    if (!response.ok) throw new Error(`Webhook respondeu HTTP ${String(response.status)}.`);
  }
}
