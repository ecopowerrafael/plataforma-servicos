import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  type GatewayChargeInput,
  type GatewayChargeResult,
  type GatewayWebhookEvent,
  type PaymentGatewayProviderAdapter,
} from '../provider.js';
import { type HttpClient } from './http-client.js';

const BASE_URL = 'https://api.mercadopago.com';

function mapStatus(mpStatus: unknown): GatewayChargeResult['status'] {
  switch (mpStatus) {
    case 'approved':
      return 'PAID';
    case 'pending':
      return 'PENDING';
    case 'authorized':
    case 'in_process':
    case 'in_mediation':
      return 'PROCESSING';
    case 'rejected':
      return 'FAILED';
    case 'cancelled':
      return 'CANCELED';
    case 'refunded':
    case 'charged_back':
      return 'REFUNDED';
    default:
      return 'PROCESSING';
  }
}

function accessToken(credentials: Record<string, unknown>): string {
  const value = credentials.accessToken;
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Credenciais do Mercado Pago ausentes ou inválidas.');
  return value;
}

/**
 * Adapter real sobre a API REST do Mercado Pago (/v1/payments). Usa um HttpClient injetável
 * para permitir testes 100% offline — nenhuma chamada de rede real ocorre na suíte automatizada.
 *
 * Webhooks do Mercado Pago não carregam o status final do pagamento no corpo da notificação
 * (apenas {type, data:{id}}), então parseWebhookEvent() — que é síncrono e não pode fazer
 * requisições HTTP — devolve um status "PROCESSING" provisório. A reconciliação autoritativa
 * acontece via getCharge(..., refresh=true), que consulta a API real e só então confirma o
 * pagamento (reaproveitando o fluxo já existente em PaymentGatewayService).
 */
export class MercadoPagoProviderAdapter implements PaymentGatewayProviderAdapter {
  public readonly name = 'mercadopago';

  public constructor(private readonly http: HttpClient) {}

  public async createCharge(
    credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    input: GatewayChargeInput,
  ): Promise<GatewayChargeResult> {
    const response = await this.http.request({
      method: 'POST',
      url: `${BASE_URL}/v1/payments`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken(credentials)}`,
        'X-Idempotency-Key': input.idempotencyKey,
      },
      body: {
        transaction_amount: Number(input.amountCents) / 100,
        description: input.description ?? undefined,
        payment_method_id: 'pix',
        payer: { email: 'cliente@example.com' },
      },
    });
    if (response.status >= 400)
      throw new Error(
        `Mercado Pago recusou a criação da cobrança (HTTP ${String(response.status)}).`,
      );

    const body = response.body as Record<string, unknown>;
    const pixCopyPaste =
      (body.point_of_interaction as Record<string, unknown> | undefined)?.transaction_data !==
      undefined
        ? (
            (body.point_of_interaction as Record<string, unknown>).transaction_data as Record<
              string,
              unknown
            >
          ).qr_code
        : undefined;

    return {
      externalId: String(body.id),
      status: mapStatus(body.status),
      raw: body,
      pixCopyPaste: typeof pixCopyPaste === 'string' ? pixCopyPaste : null,
    };
  }

  public async getCharge(
    credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    externalId: string,
  ): Promise<GatewayChargeResult> {
    const response = await this.http.request({
      method: 'GET',
      url: `${BASE_URL}/v1/payments/${externalId}`,
      headers: { Authorization: `Bearer ${accessToken(credentials)}` },
    });
    if (response.status >= 400)
      throw new Error(
        `Mercado Pago recusou a consulta da cobrança (HTTP ${String(response.status)}).`,
      );

    const body = response.body as Record<string, unknown>;
    return { externalId, status: mapStatus(body.status), raw: body };
  }

  public async cancelCharge(
    credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    externalId: string,
  ): Promise<void> {
    const response = await this.http.request({
      method: 'PUT',
      url: `${BASE_URL}/v1/payments/${externalId}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken(credentials)}`,
      },
      body: { status: 'cancelled' },
    });
    if (response.status >= 400)
      throw new Error(
        `Mercado Pago recusou o cancelamento da cobrança (HTTP ${String(response.status)}).`,
      );
  }

  /**
   * Valida a assinatura HMAC-SHA256 do header `x-signature` (formato `ts=...,v1=...`) contra
   * o manifest `id:{dataId};request-id:{xRequestId};ts:{ts};`, conforme documentação oficial.
   */
  public verifyWebhookSignature(
    credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    rawBody: string,
    headers: Record<string, string>,
  ): boolean {
    const webhookSecret = credentials.webhookSecret;
    if (typeof webhookSecret !== 'string' || webhookSecret.length === 0) return false;

    const signatureHeader = headers['x-signature'];
    const requestId = headers['x-request-id'];
    if (typeof signatureHeader !== 'string' || typeof requestId !== 'string') return false;

    const parts = new Map(
      signatureHeader.split(',').map((part) => {
        const [key, value] = part.split('=', 2);
        return [key?.trim() ?? '', value?.trim() ?? ''];
      }),
    );
    const ts = parts.get('ts');
    const v1 = parts.get('v1');
    if (ts === undefined || v1 === undefined) return false;

    let dataId: string | undefined;
    try {
      const parsed = JSON.parse(rawBody) as { data?: { id?: string | number } };
      dataId = parsed.data?.id === undefined ? undefined : String(parsed.data.id);
    } catch {
      return false;
    }
    if (dataId === undefined) return false;

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = createHmac('sha256', webhookSecret).update(manifest).digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(v1, 'hex');
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  public parseWebhookEvent(rawBody: string): GatewayWebhookEvent {
    try {
      const parsed = JSON.parse(rawBody) as {
        id?: string | number;
        data?: { id?: string | number };
      };
      const externalEventId = parsed.id === undefined ? null : String(parsed.id);
      const externalId = parsed.data?.id === undefined ? null : String(parsed.data.id);
      return { externalEventId, externalId, status: 'PROCESSING', raw: parsed };
    } catch {
      return { externalEventId: null, externalId: null, status: 'PROCESSING', raw: rawBody };
    }
  }
}
