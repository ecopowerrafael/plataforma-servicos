import { describe, expect, it, vi } from 'vitest';
import { AssemblyAiTranscriptionClient } from './assemblyai-transcription.client.js';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('AssemblyAiTranscriptionClient', () => {
  it('uploads, creates and polls one transcript', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ upload_url: 'https://cdn.test/audio' }))
      .mockResolvedValueOnce(response({ id: 'abc', status: 'queued' }))
      .mockResolvedValueOnce(response({ id: 'abc', status: 'completed', text: 'quero um corte amanhã', audio_duration: 4 }));
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: (...args: unknown[]) => void) => { callback(); return 0 as never; }) as typeof setTimeout);
    const created = vi.fn();
    const result = await new AssemblyAiTranscriptionClient(fetcher).transcribe({ apiKey: 'tenant-key', audio: Buffer.from('audio'), mimeType: 'audio/ogg', onTranscriptCreated: created });
    expect(result).toMatchObject({ text: 'quero um corte amanhã', transcriptId: 'abc', durationMs: 4000 });
    expect(created).toHaveBeenCalledWith('abc');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', headers: expect.objectContaining({ authorization: 'tenant-key', 'content-type': 'audio/ogg' }) });
  });

  it('classifies unauthorized credentials without exposing the key', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: 'unauthorized' }, 401));
    await expect(new AssemblyAiTranscriptionClient(fetcher).validateApiKey('secret-key')).rejects.toMatchObject({ code: 'ASSEMBLYAI_UNAUTHORIZED' });
  });

  it('retries one transient polling failure without repeating upload or creation', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ upload_url: 'https://cdn.test/audio' }))
      .mockResolvedValueOnce(response({ id: 'abc', status: 'queued' }))
      .mockResolvedValueOnce(response({ error: 'temporary' }, 503))
      .mockResolvedValueOnce(response({ id: 'abc', status: 'completed', text: 'ok' }));
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: (...args: unknown[]) => void) => { callback(); return 0 as never; }) as typeof setTimeout);
    await expect(new AssemblyAiTranscriptionClient(fetcher).transcribe({ apiKey: 'tenant-key', audio: Buffer.from('audio'), mimeType: 'audio/ogg' })).resolves.toMatchObject({ transcriptId: 'abc', text: 'ok' });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ method: 'GET' });
    expect(fetcher.mock.calls[3]?.[1]).toMatchObject({ method: 'GET' });
  });
});
