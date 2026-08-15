import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const web = (file: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../web/src/components/tenants/${file}`, import.meta.url)),
    'utf8',
  );

describe('estrutura das telas de marketing', () => {
  it('mantém a configuração técnica do WhatsApp fora de Modelos', () => {
    const templates = web('NotificationTemplateModule.tsx');
    expect(templates).not.toContain('WhatsAppSettingsCard');
    expect(templates).not.toContain('Configurar webhooks');
    expect(templates).toContain('Modelos de mensagens');
  });

  it('mantém as ferramentas técnicas disponíveis em Integrações', () => {
    const integrations = web('IntegrationsModule.tsx');
    expect(integrations).toContain('WhatsAppSettingsCard');
  });

  it('não usa NotificationLog como produto principal da Central de Comunicação', () => {
    const campaigns = web('NotificationCampaignModule.tsx');
    expect(campaigns).toContain('Central de comunicação');
    expect(campaigns).not.toContain('NotificationLog');
  });
});
