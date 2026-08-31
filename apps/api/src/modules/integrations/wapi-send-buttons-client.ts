/**
 * Cliente compartilhado para envio de mensagens interativas com botões via W-API.
 * Reutilizado por WApiWhatsAppDelivery (tenant) e WApiProspectingMessageSender (global).
 */

export interface WapiSendButtonsClientInput {
  instanceId: string;
  token: string;
  phone: string;
  message: string;
  buttons: Array<{ label: string }>;
  fetcher?: typeof fetch;
}

export interface WapiSendButtonsClientResult {
  ok: boolean;
  httpStatus: number | null;
  externalCode: string | null;
  externalMessageId: string | null;
  message: string;
}

export class WapiSendButtonsClient {
  public async send(input: WapiSendButtonsClientInput): Promise<WapiSendButtonsClientResult> {
    const {
      instanceId,
      token,
      phone,
      message,
      buttons,
      fetcher = fetch,
    } = input;

    try {
      const response = await fetcher(
        `https://api.w-api.app/v1/message/send-button-actions?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone,
            message,
            buttonActions: buttons.map(({ label }) => ({
              type: 'REPLAY',
              buttonText: label,
            })),
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      const payload = await this.readJsonObject(response);
      const externalCode = this.sanitizeExternalText(
        payload.code ?? payload.errorCode ?? payload.error,
      );
      const externalMessageId = this.sanitizeExternalText(
        payload.messageId ?? payload.id,
      );

      if (!response.ok || payload.error === true) {
        return {
          ok: false,
          httpStatus: response.status,
          externalCode,
          externalMessageId: null,
          message:
            this.sanitizeExternalText(payload.message ?? payload.error) ??
            `O WhatsApp respondeu HTTP ${String(response.status)} sem detalhamento.`,
        };
      }

      return {
        ok: true,
        httpStatus: response.status,
        externalCode: null,
        externalMessageId,
        message: 'Mensagem com botões enviada.',
      };
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        externalCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
        externalMessageId: null,
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao enviar mensagem com botões.',
      };
    }
  }

  private async readJsonObject(response: Response): Promise<Record<string, unknown>> {
    try {
      const value: unknown = await response.json();
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private sanitizeExternalText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return value
      .replace(/Bearer\s+\S+/giu, '[protegido]')
      .replace(/[A-Za-z0-9_-]{40,}/gu, '[protegido]')
      .slice(0, 240);
  }
}
