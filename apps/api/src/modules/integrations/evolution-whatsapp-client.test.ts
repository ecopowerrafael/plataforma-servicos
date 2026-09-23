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

  it('uses the instance token and preserves quick-reply IDs', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'button-1' } }), { status: 200 }));
    await new EvolutionWhatsAppClient('https://evolution.internal', 'global-key', fetcher).sendButton('instance-token', '5511999999999', 'Escolha', [{ id: 'confirmar', label: 'Confirmar' }]);
    expect(fetcher).toHaveBeenCalledWith('https://evolution.internal/send/button', expect.objectContaining({ headers: expect.objectContaining({ apikey: 'instance-token' }), body: JSON.stringify({ number: '5511999999999', description: 'Escolha', buttons: [{ type: 'reply', id: 'confirmar', displayText: 'Confirmar' }] }) }));
  });

  it('uses the instance token and preserves list row IDs', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'list-1' } }), { status: 200 }));
    await new EvolutionWhatsAppClient('https://evolution.internal', 'global-key', fetcher).sendList('instance-token', '5511999999999', 'Escolha', [{ rowId: 'service-1', title: 'Serviço' }]);
    expect(fetcher).toHaveBeenCalledWith('https://evolution.internal/send/list', expect.objectContaining({ headers: expect.objectContaining({ apikey: 'instance-token' }), body: JSON.stringify({ number: '5511999999999', description: 'Escolha', buttonText: 'Ver opções', sections: [{ title: 'Opções', rows: [{ rowId: 'service-1', title: 'Serviço' }] }] }) }));
  });
});
