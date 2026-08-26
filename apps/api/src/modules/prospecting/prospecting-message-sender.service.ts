import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { type ProspectingMessageSendInput, type ProspectingMessageSendResult, type ProspectingMessageSender } from './prospecting-message-sender.js';
import { type Environment } from '../../config/environment.js';

interface WApiSendResponse {
  messageId?: string;
  id?: string;
  error?: boolean;
  message?: string;
  code?: string;
}

function isRetryable(statusCode: number | null): boolean {
  if (statusCode === null) return true;
  return statusCode === 429 || (statusCode >= 500 && statusCode <= 599);
}

function getSanitizedMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+\S+/giu, '[protegido]')
      .replace(/[A-Za-z0-9_-]{40,}/gu, '[protegido]')
      .replace(/token:\s*\S+/giu, '[protegido]')
      .replace(/Token:\s*\S+/giu, '[protegido]')
      .replace(/secret[_-]?\w+/giu, '[protegido]')
      .slice(0, 240);
  }
  return null;
}

export class WApiProspectingMessageSender implements ProspectingMessageSender {
  public constructor(
    private readonly configService: ProspectingWhatsAppConfigService,
    private readonly environment: Environment,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async sendText(input: ProspectingMessageSendInput): Promise<ProspectingMessageSendResult> {
    const config = await this.configService.getConfig();

    if (!config) {
      return {
        success: false,
        provider: 'WAPI',
        externalMessageId: null,
        errorCode: 'PROSPECTING_WHATSAPP_NOT_CONFIGURED',
        errorMessage: 'ProspectingWhatsApp não foi configurado.',
        retryable: false,
      };
    }

    if (!config.isActive) {
      return {
        success: false,
        provider: 'WAPI',
        externalMessageId: null,
        errorCode: 'PROSPECTING_WHATSAPP_DISABLED',
        errorMessage: 'ProspectingWhatsApp está desativado.',
        retryable: false,
      };
    }

    const normalizedPhone = normalizeWhatsAppPhone(input.phone);
    if (!normalizedPhone) {
      return {
        success: false,
        provider: 'WAPI',
        externalMessageId: null,
        errorCode: 'INVALID_PHONE',
        errorMessage: 'Número de telefone inválido.',
        retryable: false,
      };
    }

    if (!input.body || input.body.trim().length === 0) {
      return {
        success: false,
        provider: 'WAPI',
        externalMessageId: null,
        errorCode: 'INVALID_BODY',
        errorMessage: 'Corpo da mensagem não pode estar vazio.',
        retryable: false,
      };
    }

    const token = await this.configService.getDecryptedToken();
    if (!token) {
      return {
        success: false,
        provider: 'WAPI',
        externalMessageId: null,
        errorCode: 'TOKEN_DECRYPTION_FAILED',
        errorMessage: 'Falha ao descriptografar o token.',
        retryable: false,
      };
    }

    if (this.environment.PROSPECTING_DRY_RUN) {
      return {
        success: true,
        provider: 'DRY_RUN',
        externalMessageId: null,
      };
    }

    return this.sendViaWApi(config.instanceId, token, normalizedPhone, input.body);
  }

  private async sendViaWApi(
    instanceId: string,
    token: string,
    phone: string,
    message: string,
  ): Promise<ProspectingMessageSendResult> {
    try {
      const response = await this.fetcher(
        `https://api.w-api.app/v1/message/send-text?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone,
            message,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      const payload: unknown = await response.json().catch(() => null);
      const body = (payload ?? {}) as WApiSendResponse;

      if (!response.ok || body.error === true) {
        const errorMessage =
          getSanitizedMessage(body.message) ??
          `W-API respondeu HTTP ${response.status} sem detalhamento.`;
        const errorCode = getSanitizedMessage(body.code) ?? String(response.status);

        return {
          success: false,
          provider: 'WAPI',
          externalMessageId: null,
          errorCode,
          errorMessage,
          retryable: isRetryable(response.status),
        };
      }

      const externalMessageId = getSanitizedMessage(body.messageId ?? body.id);

      return {
        success: true,
        provider: 'WAPI',
        externalMessageId,
      };
    } catch (error) {
      const isTimeout =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      const errorMessage = isTimeout
        ? 'Timeout na requisição para W-API. Tente novamente.'
        : 'Erro de conexão com W-API.';

      return {
        success: false,
        provider: 'WAPI',
        externalMessageId: null,
        errorCode: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        errorMessage,
        retryable: true,
      };
    }
  }
}
