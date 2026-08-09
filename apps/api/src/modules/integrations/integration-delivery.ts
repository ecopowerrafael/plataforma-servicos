import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { type PrismaClient } from '../../database-client/client.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';

export class IntegrationUnavailableError extends Error {}
function credentials(
  cipher: CredentialsCipher | undefined,
  payload: string,
): Record<string, unknown> {
  if (cipher === undefined)
    throw new IntegrationUnavailableError('Criptografia de credenciais não configurada.');
  return cipher.decrypt(payload);
}
export function privateAddress(address: string): boolean {
  return /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fc|fd)/iu.test(
    address,
  );
}

export class MetaWhatsAppDelivery {
  public constructor(
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher | undefined,
  ) {}
  public async send(tenantId: bigint, to: string, text: string): Promise<void> {
    const config = await this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId } });
    if (!config?.active)
      throw new IntegrationUnavailableError('WhatsApp não configurado ou inativo para o tenant.');
    const token = credentials(this.cipher, config.encryptedAccessToken).accessToken;
    if (typeof token !== 'string')
      throw new IntegrationUnavailableError('Credencial do WhatsApp inválida.');
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      },
    );
    if (!response.ok) throw new Error(`WhatsApp oficial respondeu HTTP ${String(response.status)}.`);
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
      throw new IntegrationUnavailableError('Integração externa não encontrada ou inativa.');
    const url = new URL(config.endpoint);
    if (url.protocol !== 'https:' || url.hostname === 'localhost' || isIP(url.hostname) !== 0)
      throw new Error('Endpoint externo não permitido.');
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.some(({ address }) => privateAddress(address)))
      throw new Error('Endpoint externo resolve para rede privada.');
    const secret =
      config.encryptedSecret === null
        ? null
        : credentials(this.cipher, config.encryptedSecret).secret;
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
