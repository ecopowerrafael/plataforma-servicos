/**
 * Abstração HTTP isolável: permite substituir o transporte real por um fake nos testes,
 * evitando qualquer dependência de rede real na suíte automatizada.
 */
export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface HttpClient {
  request(input: {
    method: 'GET' | 'POST' | 'PUT';
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  }): Promise<HttpResponse>;
}

export class FetchHttpClient implements HttpClient {
  public async request(input: {
    method: 'GET' | 'POST' | 'PUT';
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  }): Promise<HttpResponse> {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  }
}
