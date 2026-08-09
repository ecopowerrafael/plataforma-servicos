import { buildPixBrCode } from './pix-brcode.js';
import {
  type GatewayChargeInput,
  type GatewayChargeResult,
  type GatewayWebhookEvent,
  type PaymentGatewayProviderAdapter,
} from './provider.js';

/**
 * PIX "por chave própria": nenhuma API bancária externa é chamada. createCharge() apenas
 * monta o payload BR Code localmente (assinado pelo próprio CRC16, sem servidor externo) e
 * devolve um externalId sintético — o pagamento em si não pode ser confirmado
 * automaticamente (não há nenhum sistema externo consultável), por isso getCharge() nunca
 * inventa um status pago: a confirmação é sempre manual, feita pelo estabelecimento
 * reaproveitando PaymentService (ver PaymentGatewayService.confirmManualCharge).
 */
export class PixLocalProviderAdapter implements PaymentGatewayProviderAdapter {
  public readonly name = 'pix-local';

  public createCharge(
    credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    input: GatewayChargeInput,
  ): Promise<GatewayChargeResult> {
    const pixCopyPaste = buildPixBrCode({
      pixKey: typeof credentials.key === 'string' ? credentials.key : '',
      receiverName: typeof credentials.receiverName === 'string' ? credentials.receiverName : '',
      city: typeof credentials.city === 'string' ? credentials.city : '',
      amountCents: input.amountCents,
      referenceId: input.idempotencyKey,
      description: input.description,
    });
    return Promise.resolve({
      externalId: `local-${input.idempotencyKey}`,
      status: 'PENDING',
      raw: { pixCopyPaste },
      pixCopyPaste,
    });
  }

  /** Não há autoridade externa para consultar: o status só muda por confirmação manual. */
  public getCharge(
    _credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    externalId: string,
  ): Promise<GatewayChargeResult> {
    return Promise.resolve({ externalId, status: 'PENDING', raw: {} });
  }

  public cancelCharge(): Promise<void> {
    return Promise.resolve();
  }

  /** PIX local não recebe webhooks — qualquer tentativa é rejeitada. */
  public verifyWebhookSignature(): boolean {
    return false;
  }

  public parseWebhookEvent(rawBody: string): GatewayWebhookEvent {
    return { externalEventId: null, externalId: null, status: 'PENDING', raw: rawBody };
  }
}
