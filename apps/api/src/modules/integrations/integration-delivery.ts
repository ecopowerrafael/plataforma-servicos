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

export interface WhatsAppDelivery {
  send(tenantId: bigint, to: string, text: string): Promise<void>;
  testConnection(tenantId: bigint, input?: {instanceId?:string|undefined;token?:string|undefined}): Promise<WhatsAppConnectionResult>;
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
