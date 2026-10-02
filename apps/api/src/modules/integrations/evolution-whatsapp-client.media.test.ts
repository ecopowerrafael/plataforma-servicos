import { describe, expect, it, vi } from 'vitest';
import { EvolutionWhatsAppClient } from './evolution-whatsapp-client.js';

describe('EvolutionWhatsAppClient media', () => {
  it('sends the audited message envelope and decodes base64', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { base64: 'data:audio/ogg;base64,YXVk', mimetype: 'audio/ogg' } }), { status: 200 }));
    const result = await new EvolutionWhatsAppClient('https://evolution.test', 'global', fetcher).downloadMedia('instance-token', { key: { id: 'msg-1' }, message: { audioMessage: { mimetype: 'audio/ogg' } } });
    expect(result).toMatchObject({ mimeType: 'audio/ogg', fileSizeBytes: 3 });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ message: { key: { id: 'msg-1' }, message: { audioMessage: { mimetype: 'audio/ogg' } } } });
  });
});
