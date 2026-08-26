/**
 * Cliente compartilhado para envio de texto via W-API.
 *
 * Centraliza:
 * - Base URL única
 * - Transporte HTTP (fetch + timeout)
 * - Headers comuns (Authorization, Content-Type)
 * - Parsing de resposta
 * - Classificação de erros (timeout, network, HTTP status)
 *
 * Reutilizado por:
 * - WApiWhatsAppDelivery (tenants)
 * - ProspectingMessageSender (global Prospecting)
 */

export interface WapiSendTextRequest {
  instanceId: string;
  token: string;
  phone: string;
  message: string;
}

export interface WapiSendTextResponse {
  ok: boolean;
  httpStatus: number | null;
  externalCode: string | null;
  externalMessageId: string | null;
  message: string;
}

function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  return response
    .json()
    .then((value: unknown) => {
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    })
    .catch(() => ({}));
}

function sanitizeExternalText(value: unknown): string | null {
  return typeof value === 'string'
    ? value
        .replace(/Bearer\s+\S+/giu, '[protegido]')
        .replace(/[A-Za-z0-9_-]{40,}/gu, '[protegido]')
        .slice(0, 240)
    : null;
}

export class WapiSendTextClient {
  private readonly baseUrl = 'https://api.w-api.app';
  private readonly timeoutMs = 15_000;

  public constructor(private readonly fetcher: typeof fetch = fetch) {}

  public async sendText(request: WapiSendTextRequest): Promise<WapiSendTextResponse> {
    try {
      const response = await this.fetcher(
        `${this.baseUrl}/v1/message/send-text?instanceId=${encodeURIComponent(request.instanceId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${request.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: request.phone,
            message: request.message,
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );

      return await this.parseResponse(response, 'Texto enviado.');
    } catch (error) {
      return this.mapTransportError(error);
    }
  }

  private async parseResponse(
    response: Response,
    successMessage: string,
  ): Promise<WapiSendTextResponse> {
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

    if (!response.ok || payload.error === true) {
      return {
        ok: false,
        httpStatus: response.status,
        externalCode,
        externalMessageId: null,
        message:
          externalMessage ?? `O WhatsApp respondeu HTTP ${String(response.status)} sem detalhamento.`,
      };
    }

    return {
      ok: true,
      httpStatus: response.status,
      externalCode,
      externalMessageId,
      message: externalMessage ?? successMessage,
    };
  }

  private mapTransportError(error: unknown): WapiSendTextResponse {
    const isTimeout =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

    return {
      ok: false,
      httpStatus: null,
      externalCode: null,
      externalMessageId: null,
      message: isTimeout
        ? 'A chamada demorou mais que o esperado. Tente novamente.'
        : 'Não foi possível acessar o serviço do WhatsApp. Verifique a rede e tente novamente.',
    };
  }
}
