import { describe, expect, it, vi } from 'vitest';
import { ProspectingRealtimeReplyService } from './prospecting-realtime-reply.service.js';

function subject(sendResult: any, existing: any = null) {
  const client: any = {
    prospectingMessage: {
      findFirst: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: 10n, status: 'PENDING', externalMessageId: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const sender = { sendText: vi.fn().mockResolvedValue(sendResult), sendButtons: vi.fn() };
  return { client, sender, service: new ProspectingRealtimeReplyService(client, sender as any) };
}

const input = { campaignId: null, leadId: null, inboundMessageId: 4n, phone: '5511999999999', body: 'Oi', action: 'ATTENDANT_GREETING' };

describe('ProspectingRealtimeReplyService', () => {
  it('persiste antes de enviar e marca SENT', async () => {
    const { service, client, sender } = subject({ success: true, externalMessageId: 'out-1' });
    const result = await service.send(input);
    expect(client.prospectingMessage.create).toHaveBeenCalledBefore(sender.sendText);
    expect(result.sent).toBe(true);
    expect(client.prospectingMessage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', externalMessageId: 'out-1' }) }));
  });

  it('não envia novamente quando a chave já foi concluída', async () => {
    const { service, sender } = subject({ success: true, externalMessageId: 'out-1' }, { id: 10n, status: 'SENT', externalMessageId: 'out-1' });
    const result = await service.send(input);
    expect(result.sent).toBe(true);
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('agenda retry em falha temporária', async () => {
    const { service, client } = subject({ success: false, retryable: true, errorCode: 'TIMEOUT', errorMessage: 'timeout' });
    const result = await service.send(input);
    expect(result.retryScheduled).toBe(true);
    expect(client.prospectingMessage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', errorCode: 'TIMEOUT' }) }));
  });
});
