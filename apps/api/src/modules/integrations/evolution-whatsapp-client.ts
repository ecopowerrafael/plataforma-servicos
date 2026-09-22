import { AppError } from '../../errors/AppError.js';

export class EvolutionWhatsAppClient {
  public constructor(private readonly baseUrl: string | (() => Promise<string>), private readonly apiKey: string | (() => Promise<string>), private readonly fetcher: typeof fetch = fetch) {}

  private async request<T>(path: string, init: RequestInit = {}, requestApiKey?: string): Promise<T> {
    const baseUrl = typeof this.baseUrl === 'function' ? await this.baseUrl() : this.baseUrl;
    const apiKey = requestApiKey ?? (typeof this.apiKey === 'function' ? await this.apiKey() : this.apiKey);
    if (!baseUrl.trim() || !apiKey.trim()) throw new AppError({ code: 'EVOLUTION_PROVIDER_UNAVAILABLE', message: 'A Evolution não está configurada.', statusCode: 503 });
    const response = await this.fetcher(`${baseUrl.replace(/\/$/u, '')}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', apikey: apiKey, ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) { const details = Array.isArray(body) ? body.filter((item): item is { path: string; message: string } => Boolean(item && typeof item === 'object' && 'path' in item && 'message' in item)) : []; throw new AppError({ code: response.status === 401 || response.status === 403 ? 'EVOLUTION_UNAUTHORIZED' : 'EVOLUTION_PROVIDER_ERROR', message: `A Evolution respondeu HTTP ${response.status}.`, statusCode: response.status === 401 || response.status === 403 ? 401 : 502, ...(details.length > 0 ? { details } : {}) }); }
    return ((body as { data?: unknown } | null)?.data ?? body) as T;
  }

  public createInstance(instanceName: string, instanceToken: string) { return this.request<{ id?: string; instanceId?: string; name?: string; instanceName?: string }>('/instance/create', { method: 'POST', body: JSON.stringify({ name: instanceName, token: instanceToken }) }); }
  public listInstances() { return this.request<unknown[]>('/instance/all', { method: 'GET' }); }
  public qr(instanceToken: string) { return this.request<{ qrCode?: string; code?: string; Qrcode?: string; Code?: string }>('/instance/qr', { method: 'GET' }, instanceToken); }
  public status(instanceToken: string) { return this.request<{ status?: string; state?: string; connected?: boolean; loggedIn?: boolean }>('/instance/status', { method: 'GET' }, instanceToken); }
  public disconnect(instanceToken: string) { return this.request<unknown>('/instance/disconnect', { method: 'POST' }, instanceToken); }
  public reconnect(instanceToken: string) { return this.request<{ qrCode?: string; code?: string; Qrcode?: string; Code?: string }>('/instance/reconnect', { method: 'POST' }, instanceToken); }
  public sendText(instanceToken: string, number: string, text: string) { return this.request<{ id?: string; messageId?: string }>('/send/text', { method: 'POST', body: JSON.stringify({ number, text }) }, instanceToken); }
  public sendButton(instanceToken: string, number: string, text: string, buttons: Array<{ id: string; label: string }>) { return this.request<{ id?: string; messageId?: string }>('/send/button', { method: 'POST', body: JSON.stringify({ number, text, buttons: buttons.map((button) => ({ type: 'quick_reply', id: button.id, displayText: button.label })) }) }, instanceToken); }
  public sendList(instanceToken: string, number: string, text: string, rows: Array<{ rowId: string; title: string }>) { return this.request<{ id?: string; messageId?: string }>('/send/list', { method: 'POST', body: JSON.stringify({ number, text, buttonText: 'Ver opções', sections: [{ title: 'Opções', rows }] }) }, instanceToken); }
}
