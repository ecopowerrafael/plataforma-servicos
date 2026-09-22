import { describe, expect, it, vi } from 'vitest';
import { EvolutionWhatsAppClient } from './evolution-whatsapp-client.js';

describe('EvolutionWhatsAppClient', () => {
  it('sends the global apikey server-side and unwraps the validated data envelope', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'success', data: { id: 'instance-1' } }), { status: 200 }));
    const client = new EvolutionWhatsAppClient('https://evolution.internal/', 'secret-global-key', fetcher);
    await expect(client.createInstance('tenant-7-demo', 'instance-token')).resolves.toEqual({ id: 'instance-1' });
    expect(fetcher).toHaveBeenCalledWith('https://evolution.internal/instance/create', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ apikey: 'secret-global-key' }), body: JSON.stringify({ name: 'tenant-7-demo', token: 'instance-token' }) }));
  });

  it('uses the instance token for non-administrative operations', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { connected: true } }), { status: 200 }));
    await new EvolutionWhatsAppClient('https://evolution.internal', 'global-key', fetcher).status('instance-token');
    expect(fetcher).toHaveBeenCalledWith('https://evolution.internal/instance/status', expect.objectContaining({ headers: expect.objectContaining({ apikey: 'instance-token' }) }));
  });

  it('normalizes provider errors without logging or returning the api key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'bad request' }), { status: 400 }));
    await expect(new EvolutionWhatsAppClient('https://evolution.internal', 'secret-global-key', fetcher).status('instance-1')).rejects.toMatchObject({ code: 'EVOLUTION_PROVIDER_ERROR' });
  });
});
