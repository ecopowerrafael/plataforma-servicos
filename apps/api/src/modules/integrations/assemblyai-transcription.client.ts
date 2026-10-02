import { AppError } from '../../errors/AppError.js';

const API = 'https://api.assemblyai.com';
const json = (value: unknown) => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const timeoutSignal = (ms: number) => AbortSignal.timeout(ms);

export class AssemblyAiTranscriptionClient {
  public constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async request(path: string, apiKey: string, init: RequestInit, timeoutMs: number) {
    let response: Response;
    try { response = await this.fetcher(`${API}${path}`, { ...init, headers: { authorization: apiKey, ...(init.headers ?? {}) }, signal: timeoutSignal(timeoutMs) }); }
    catch (error) { throw new AppError({ code: 'ASSEMBLYAI_TIMEOUT', message: 'A transcrição demorou mais que o esperado.', statusCode: 504, cause: error }); }
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'ASSEMBLYAI_UNAUTHORIZED' : response.status === 429 ? 'ASSEMBLYAI_RATE_LIMITED' : response.status >= 500 ? 'ASSEMBLYAI_UNAVAILABLE' : 'ASSEMBLYAI_INVALID_RESPONSE';
      throw new AppError({ code, message: 'Não foi possível processar o áudio.', statusCode: response.status === 429 ? 429 : 502 });
    }
    return response;
  }

  public async validateApiKey(apiKey: string) { await this.request('/v2/transcript?limit=1', apiKey, { method: 'GET' }, 10_000); return true; }

  public async getTranscript(apiKey: string, transcriptId: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.request(`/v2/transcript/${encodeURIComponent(transcriptId)}`, apiKey, { method: 'GET' }, 15_000);
        return json(await response.json());
      } catch (error) {
        const code = error instanceof AppError ? error.code : null;
        if (attempt === 1 || (code !== 'ASSEMBLYAI_RATE_LIMITED' && code !== 'ASSEMBLYAI_UNAVAILABLE' && code !== 'ASSEMBLYAI_TIMEOUT')) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new AppError({ code: 'ASSEMBLYAI_UNAVAILABLE', message: 'Não foi possível consultar a transcrição.', statusCode: 502 });
  }

  public async transcribe(input: { apiKey: string; audio: Buffer; mimeType: string; languageCode?: string; maxWaitMs?: number; onTranscriptCreated?: (id: string) => Promise<void> }) {
    const uploaded = await this.request('/v2/upload', input.apiKey, { method: 'POST', body: input.audio, headers: { 'content-type': input.mimeType } }, 30_000);
    const uploadBody = json(await uploaded.json());
    const uploadUrl = typeof uploadBody.upload_url === 'string' ? uploadBody.upload_url : null;
    if (!uploadUrl) throw new AppError({ code: 'ASSEMBLYAI_INVALID_RESPONSE', message: 'Resposta inválida do serviço de transcrição.', statusCode: 502 });
    const created = await this.request('/v2/transcript', input.apiKey, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio_url: uploadUrl, speech_models: ['universal-3-pro'], language_code: input.languageCode ?? 'pt' }) }, 15_000);
    const createdBody = json(await created.json());
    const id = typeof createdBody.id === 'string' ? createdBody.id : null;
    if (!id) throw new AppError({ code: 'ASSEMBLYAI_INVALID_RESPONSE', message: 'Resposta inválida do serviço de transcrição.', statusCode: 502 });
    await input.onTranscriptCreated?.(id);
    const deadline = Date.now() + (input.maxWaitMs ?? 90_000);
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const body = await this.getTranscript(input.apiKey, id);
      const status = body.status;
      if (status === 'completed') {
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) throw new AppError({ code: 'EMPTY_TRANSCRIPT', message: 'Não foi possível identificar fala nesse áudio.', statusCode: 422 });
        return { text, transcriptId: id, durationMs: typeof body.audio_duration === 'number' ? body.audio_duration * 1000 : null };
      }
      if (status === 'error') throw new AppError({ code: 'ASSEMBLYAI_UNAVAILABLE', message: 'Não foi possível processar o áudio.', statusCode: 502 });
    }
    throw new AppError({ code: 'ASSEMBLYAI_TIMEOUT', message: 'A transcrição demorou mais que o esperado.', statusCode: 504 });
  }
}
