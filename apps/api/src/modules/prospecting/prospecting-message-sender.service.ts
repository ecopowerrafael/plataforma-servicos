import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { WapiSendTextClient } from '../integrations/wapi-send-text-client.js';
import { WapiSendButtonsClient } from '../integrations/wapi-send-buttons-client.js';
import { type ProspectingMessageSendInput, type ProspectingMessageSendButtonsInput, type ProspectingMessageSendResult, type ProspectingMessageSender } from './prospecting-message-sender.js';
import { type Environment } from '../../config/environment.js';

function isRetryable(statusCode: number | null): boolean {
  if (statusCode === null) return true;
  return statusCode === 429 || (statusCode >= 500 && statusCode <= 599);
}

export class WApiProspectingMessageSender implements ProspectingMessageSender {
  private readonly wapiClient: WapiSendTextClient;
  private readonly wapiButtonsClient: WapiSendButtonsClient;

  public constructor(
    private readonly configService: ProspectingWhatsAppConfigService,
    private readonly environment: Environment,
    fetcher: typeof fetch = fetch,
  ) {
    this.wapiClient = new WapiSendTextClient(fetcher);
    this.wapiButtonsClient = new WapiSendButtonsClient();
  }

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

  async sendButtons(input: ProspectingMessageSendButtonsInput): Promise<ProspectingMessageSendResult> {
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

    if (!input.buttons || input.buttons.length === 0) {
      return {
        success: false,
        provider: 'WAPI',
        externalMessageId: null,
        errorCode: 'INVALID_BUTTONS',
        errorMessage: 'Mínimo de um botão é necessário.',
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

    const result = await this.wapiButtonsClient.send({
      instanceId: config.instanceId,
      token,
      phone: normalizedPhone,
      message: input.body,
      buttons: input.buttons,
    });

    return {
      success: result.ok,
      provider: 'WAPI',
      externalMessageId: result.ok ? result.externalMessageId : null,
      ...(result.ok
        ? {}
        : {
            errorCode: result.externalCode ?? String(result.httpStatus ?? 'NETWORK'),
            errorMessage: result.message,
            retryable: isRetryable(result.httpStatus),
          }),
    };
  }

  private async sendViaWApi(
    instanceId: string,
    token: string,
    phone: string,
    message: string,
  ): Promise<ProspectingMessageSendResult> {
    const result = await this.wapiClient.sendText({
      instanceId,
      token,
      phone,
      message,
    });

    return {
      success: result.ok,
      provider: 'WAPI',
      externalMessageId: result.ok ? result.externalMessageId : null,
      ...(result.ok
        ? {}
        : {
            errorCode: result.externalCode ?? String(result.httpStatus ?? 'NETWORK'),
            errorMessage: result.message,
            retryable: isRetryable(result.httpStatus),
          }),
    };
  }
}
