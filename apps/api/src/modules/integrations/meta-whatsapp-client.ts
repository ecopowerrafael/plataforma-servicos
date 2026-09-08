export interface MetaWhatsAppClientResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown>;
}

export class MetaWhatsAppClient {
  private readonly maxTemplatePages = 100;

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

  public async listTemplates(
    apiVersion: string,
    businessAccountId: string,
    accessToken: string,
  ): Promise<MetaWhatsAppClientResult> {
    let nextUrl: string | null = `${this.baseUrl}/${apiVersion}/${encodeURIComponent(businessAccountId)}/message_templates?fields=id,name,language,category,status,rejected_reason`;
    const visited = new Set<string>();
    const data: unknown[] = [];

    for (let page = 0; nextUrl !== null; page += 1) {
      if (page >= this.maxTemplatePages) return { ok: false, status: 508, payload: { error: 'META_TEMPLATE_PAGING_LIMIT' } };
      if (visited.has(nextUrl)) return { ok: false, status: 508, payload: { error: 'META_TEMPLATE_PAGING_LOOP' } };
      visited.add(nextUrl);

      const response = await this.fetcher(
        nextUrl,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) },
      );
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) return { ok: false, status: response.status, payload: {} };
      if (Array.isArray(payload.data)) data.push(...payload.data);

      nextUrl = this.nextPageUrl(payload);
    }

    return { ok: true, status: 200, payload: { data } };
  }

  public async createTemplate(
    apiVersion: string,
    businessAccountId: string,
    accessToken: string,
    payload: Record<string, unknown>,
  ): Promise<MetaWhatsAppClientResult> {
    const response = await this.fetcher(
      `${this.baseUrl}/${apiVersion}/${encodeURIComponent(businessAccountId)}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      },
    );
    return {
      ok: response.ok,
      status: response.status,
      payload: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    };
  }

  private nextPageUrl(payload: Record<string, unknown>): string | null {
    const paging = payload.paging;
    if (paging === null || typeof paging !== 'object' || Array.isArray(paging)) return null;
    const next = (paging as Record<string, unknown>).next;
    if (typeof next !== 'string' || next.trim() === '') return null;

    try {
      const parsedNext = new URL(next);
      const graphHost = new URL(this.baseUrl).hostname;
      if (parsedNext.hostname !== graphHost) return null;
      return parsedNext.toString();
    } catch {
      return null;
    }
  }
}
