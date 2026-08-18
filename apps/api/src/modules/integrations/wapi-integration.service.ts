/**
 * Cliente da W-API para provisionamento e conexão de instâncias.
 *
 * Endpoints oficiais usados (docs.w-api.app):
 * - `POST /v1/client/create-instance`      — API Integration, autentica pela chave mestra no corpo.
 * - `GET  /v1/instance/qr-code`            — QR da instância, autentica pelo token da instância.
 * - `GET  /v1/instance/status-instance`    — conexão da instância.
 * - `GET  /v1/instance/device`             — dados do aparelho conectado.
 * - `GET  /v1/instance/disconnect`         — desconecta o aparelho (não cancela a instância).
 *
 * A chave mestra só aparece aqui e nunca sai deste serviço: não vai para
 * resposta, log ou frontend. As operações da instância continuam usando o
 * token da própria instância, como o restante da integração já fazia.
 */
export interface WApiCreatedInstance {
  instanceId: string;
  token: string;
  instanceName: string;
  status: string | null;
}

export interface WApiInstanceStatus {
  connected: boolean;
}

export interface WApiDevice {
  connectedPhone: string | null;
  name: string | null;
}

export class WApiProviderError extends Error {
  public constructor(
    message: string,
    public readonly httpStatus: number | null,
    public readonly providerCode: string | null,
  ) {
    super(message);
    this.name = 'WApiProviderError';
  }
}

/** Erro de configuração da plataforma — nunca do tenant. */
export class WApiMasterKeyMissingError extends Error {
  public constructor() {
    super('Chave mestra da W-API não configurada.');
    this.name = 'WApiMasterKeyMissingError';
  }
}

interface ProviderResponse {
  error?: boolean;
  message?: string;
  code?: string;
}

export class WApiIntegrationService {
  public constructor(
    private readonly masterApiKey: string | undefined,
    private readonly baseUrl = 'https://api.w-api.app',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public get configured(): boolean {
    return this.masterApiKey !== undefined && this.masterApiKey.trim() !== '';
  }

  private url(path: string, query: Record<string, string> = {}): string {
    const search = new URLSearchParams(query).toString();
    return `${this.baseUrl.replace(/\/+$/u, '')}${path}${search === '' ? '' : `?${search}`}`;
  }

  private async parse(response: Response, operation: string): Promise<unknown> {
    const body: unknown = await response.json().catch(() => null);
    const payload = (body ?? {}) as ProviderResponse;
    if (!response.ok || payload.error === true)
      throw new WApiProviderError(
        payload.message ?? `Falha na operação ${operation}.`,
        response.status,
        payload.code ?? null,
      );
    return body;
  }

  private async call(url: string, init: RequestInit, operation: string): Promise<unknown> {
    try {
      const response = await this.fetcher(url, { ...init, signal: AbortSignal.timeout(20_000) });
      return await this.parse(response, operation);
    } catch (error) {
      if (error instanceof WApiProviderError) throw error;
      throw new WApiProviderError(`Não foi possível falar com o provedor (${operation}).`, null, null);
    }
  }

  /**
   * Cria a instância do tenant. A chave mestra vai no corpo, como a
   * documentação da API Integration define, e os webhooks já nascem apontando
   * para o endpoint público do Agendei — nada é registrado depois, a cada
   * clique. Sem `lite`, a instância é criada no modo PRO, exigido pelas
   * mensagens interativas que o Assistant usa.
   */
  public async createInstance(input: {
    instanceName: string;
    webhookUrl: string;
  }): Promise<WApiCreatedInstance> {
    if (this.masterApiKey === undefined || this.masterApiKey.trim() === '')
      throw new WApiMasterKeyMissingError();
    const body = await this.call(
      this.url('/v1/client/create-instance'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.masterApiKey,
          instanceName: input.instanceName,
          webhookReceivedUrl: input.webhookUrl,
          webhookDeliveryUrl: input.webhookUrl,
          webhookConnectedUrl: input.webhookUrl,
          webhookDisconnectedUrl: input.webhookUrl,
          webhookStatusUrl: input.webhookUrl,
        }),
      },
      'create-instance',
    );
    const payload = body as { instanceId?: unknown; token?: unknown; instanceName?: unknown; status?: unknown };
    if (typeof payload.instanceId !== 'string' || typeof payload.token !== 'string')
      throw new WApiProviderError('Resposta inesperada ao criar a instância.', null, null);
    return {
      instanceId: payload.instanceId,
      token: payload.token,
      instanceName: typeof payload.instanceName === 'string' ? payload.instanceName : input.instanceName,
      status: typeof payload.status === 'string' ? payload.status : null,
    };
  }

  /** QR em base64 (`image=disable`). É dado temporário: nunca persistido. */
  public async getQrCode(instanceId: string, token: string): Promise<string> {
    const body = await this.call(
      this.url('/v1/instance/qr-code', { instanceId, image: 'disable' }),
      { headers: { Authorization: `Bearer ${token}` } },
      'qr-code',
    );
    const payload = body as { qrcode?: unknown };
    if (typeof payload.qrcode !== 'string' || payload.qrcode.trim() === '')
      throw new WApiProviderError('O provedor não devolveu um QR Code.', null, null);
    // A W-API pode devolver apenas o base64 ou um data URL completo. A UI
    // recebe sempre uma fonte válida para <img>, sem persistir o QR.
    return payload.qrcode.startsWith('data:image/')
      ? payload.qrcode
      : `data:image/png;base64,${payload.qrcode}`;
  }

  public async getInstanceStatus(instanceId: string, token: string): Promise<WApiInstanceStatus> {
    const body = await this.call(
      this.url('/v1/instance/status-instance', { instanceId }),
      { headers: { Authorization: `Bearer ${token}` } },
      'status-instance',
    );
    const payload = body as { connected?: unknown };
    return { connected: payload.connected === true };
  }

  public async getDevice(instanceId: string, token: string): Promise<WApiDevice> {
    const body = await this.call(
      this.url('/v1/instance/device', { instanceId }),
      { headers: { Authorization: `Bearer ${token}` } },
      'device',
    );
    const payload = body as { connectedPhone?: unknown; name?: unknown };
    return {
      connectedPhone: typeof payload.connectedPhone === 'string' ? payload.connectedPhone : null,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  }

  /**
   * Desconecta o aparelho. Não cancela nem exclui a instância: ela continua
   * associada ao tenant e pode ser reconectada com um novo QR.
   */
  public async disconnect(instanceId: string, token: string): Promise<void> {
    await this.call(
      this.url('/v1/instance/disconnect', { instanceId }),
      { headers: { Authorization: `Bearer ${token}` } },
      'disconnect',
    );
  }
}
