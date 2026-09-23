import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('fronteiras comerciais fora do tenant autenticado', () => {
  it('mantém webhooks financeiros e WhatsApp fora do contexto comercial HTTP', () => {
    const billing = read('./platform-billing-webhook.routes.ts');
    const whatsapp = read('../integrations/whatsapp-webhook.routes.ts');
    expect(billing).toContain("'/public/platform-billing/webhooks/:provider'");
    expect(whatsapp).toContain("'/public/integrations/whatsapp/webhook'");
    expect(whatsapp).toContain("'/webhooks/whatsapp/wapi'");
  });

  it('aplica comercialização somente na criação de appointment', () => {
    const source = read('../appointments/appointment.service.ts');
    expect(source.indexOf('async create(')).toBeLessThan(source.indexOf('assertCommercialCapability(t, i.source)'));
    expect(source).toContain('async update(');
    expect(source).toContain('async cancelForCustomer(');
    expect(source).toContain("source === 'WHATSAPP_ASSISTANT'");
  });
});
