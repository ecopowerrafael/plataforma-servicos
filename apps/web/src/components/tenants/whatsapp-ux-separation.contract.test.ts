import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const homePageSource = readFileSync('apps/web/src/routes/HomePage.tsx', 'utf8');
const whatsappPageSource = readFileSync('apps/web/src/components/tenants/WhatsAppPage.tsx', 'utf8');
const connectionSource = readFileSync('apps/web/src/components/tenants/WhatsAppConnectionCard.tsx', 'utf8');

describe('WhatsApp connection and messages UX separation', () => {
  it('exposes WhatsApp submenus and preserves /app/whatsapp compatibility', () => {
    expect(homePageSource).toContain("to: '/app/whatsapp/conexao'");
    expect(homePageSource).toContain("to: '/app/whatsapp/mensagens'");
    expect(homePageSource).toContain('<Navigate to="/app/whatsapp/conexao" replace />');
  });

  it('renders connection and messages as separate page modes', () => {
    expect(whatsappPageSource).toContain("type WhatsAppPageMode = 'connection' | 'messages'");
    expect(whatsappPageSource).toContain("mode === 'connection'");
    expect(whatsappPageSource).toContain('<WhatsAppConnectionCard tenantPublicId={tenantPublicId} canManage={canManage} />');
    expect(whatsappPageSource).toContain('<WhatsAppAssistantConfigCard');
    expect(whatsappPageSource).toContain('<WhatsAppMessagesCard');
  });

  it('does not expose the W-API brand in the tenant connection UI', () => {
    expect(connectionSource).not.toContain('W-API');
    expect(connectionSource).toContain("name: 'API não oficial'");
    expect(connectionSource).toContain("name: 'API Oficial'");
  });

  it('makes provider switching explicit instead of changing on card click', () => {
    expect(connectionSource).toContain('apenas abre a configuração; a troca de API exige uma ação explícita');
    expect(connectionSource).toContain('Usar API Oficial');
    expect(connectionSource).toContain('Usar API não oficial');
    expect(connectionSource).toContain('setSelectedProvider(item.provider)');
  });

  it('hydrates non-secret Meta fields and only shows configured secret status', () => {
    expect(connectionSource).toContain("phoneNumberId: connection.data?.phoneNumberId ?? ''");
    expect(connectionSource).toContain("businessAccountId: connection.data?.businessAccountId ?? ''");
    expect(connectionSource).toContain("apiVersion: connection.data?.apiVersion ?? 'v23.0'");
    expect(connectionSource).toContain('✓ Token configurado');
    expect(connectionSource).toContain('✓ App Secret configurado');
    expect(connectionSource).toContain('•••••••••••• — deixe vazio para manter o atual');
  });

  it('keeps Meta templates in connection infrastructure copy', () => {
    expect(connectionSource).toContain('Templates da API Oficial');
    expect(connectionSource).toContain('Infraestrutura da Meta');
    expect(connectionSource).toContain('Não é a personalização do assistente');
  });
});
