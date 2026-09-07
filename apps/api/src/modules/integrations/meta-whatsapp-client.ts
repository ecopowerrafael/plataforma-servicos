export interface MetaWhatsAppClientResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown>;
}

export class MetaWhatsAppClient {
  public constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly baseUrl = 'https://graph.facebook.com',
  ) {}

  public async phoneNumber(
    apiVersion: string,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<MetaWhatsAppClientResult> {
    const response = await this.fetcher(
      `${this.baseUrl}/${apiVersion}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) },
    );
    return {
      ok: response.ok,
      status: response.status,
      payload: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    };
  }

  public async sendMessage(
    apiVersion: string,
    phoneNumberId: string,
    accessToken: string,
    payload: Record<string, unknown>,
  ): Promise<MetaWhatsAppClientResult> {
    const response = await this.fetcher(
      `${this.baseUrl}/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    return {
      ok: response.ok,
      status: response.status,
      payload: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    };
  }
}
