import {
  type PaymentGatewayChargeStatus,
  type PaymentGatewayEnvironment,
} from '@plataforma/shared';

export interface GatewayChargeInput {
  amountCents: bigint;
  currency: string;
  description: string | null;
  idempotencyKey: string;
}

export interface GatewayChargeResult {
  externalId: string;
  status: PaymentGatewayChargeStatus;
  raw: unknown;
  /** Copia-e-cola PIX, quando o provedor gerar uma cobrança PIX (nunca a imagem do QR). */
  pixCopyPaste?: string | null;
}

export interface GatewayWebhookEvent {
  externalEventId: string | null;
  externalId: string | null;
  status: PaymentGatewayChargeStatus;
  raw: unknown;
}

/**
 * Contrato que um provedor de pagamento (gateway) real precisa implementar para se conectar
 * a esta plataforma. Nenhuma implementação concreta existe até que um fornecedor seja
 * escolhido — ver PaymentGatewayProviderRegistry, que hoje não registra nenhum adapter.
 */
export interface PaymentGatewayProviderAdapter {
  readonly name: string;

  createCharge(
    credentials: Record<string, unknown>,
    environment: PaymentGatewayEnvironment,
    input: GatewayChargeInput,
  ): Promise<GatewayChargeResult>;

  getCharge(
    credentials: Record<string, unknown>,
    environment: PaymentGatewayEnvironment,
    externalId: string,
  ): Promise<GatewayChargeResult>;

  /** Ausente quando o provedor não suportar cancelamento de cobrança já criada. */
  cancelCharge?(
    credentials: Record<string, unknown>,
    environment: PaymentGatewayEnvironment,
    externalId: string,
  ): Promise<void>;

  verifyWebhookSignature(
    credentials: Record<string, unknown>,
    environment: PaymentGatewayEnvironment,
    rawBody: string,
    headers: Record<string, string>,
  ): boolean;

  parseWebhookEvent(rawBody: string): GatewayWebhookEvent;
}
