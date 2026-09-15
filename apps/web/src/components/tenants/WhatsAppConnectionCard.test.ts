import { describe, expect, it } from 'vitest';

import {
  shouldShowWapiActivation,
  allMetaTemplatesCreated,
  metaTemplateProvisionButtonLabel,
  metaTemplateStatusIcon,
  whatsappProviderBadge,
  whatsappProviderBadgeState,
  whatsappProviderDraftMessage,
} from './WhatsAppConnectionCard.js';

describe('WhatsAppConnectionCard provider switching state', () => {
  it('marks Meta as available when backend says it is available', () => {
    expect(whatsappProviderBadge({ provider: 'META', available: true, configured: false }, 'WAPI')).toBe('NÃO CONFIGURADA');
    expect(whatsappProviderBadgeState({ provider: 'META', available: true, configured: false }, 'WAPI')).toBe('is-not-configured');
  });

  it('keeps Meta visible as unavailable when backend says it is unavailable', () => {
    expect(whatsappProviderBadge({ provider: 'META', available: false, configured: false }, 'WAPI')).toBe('NÃO CONFIGURADA');
    expect(whatsappProviderBadgeState({ provider: 'META', available: false, configured: false }, 'WAPI')).toBe('is-not-configured');
  });

  it('shows WAPI selected when WAPI is the active visual provider', () => {
    expect(whatsappProviderBadge({ provider: 'WAPI', available: true, configured: true }, 'WAPI')).toBe('EM USO');
    expect(whatsappProviderBadgeState({ provider: 'WAPI', available: true, configured: true }, 'WAPI')).toBe('is-active');
    expect(whatsappProviderDraftMessage('WAPI', 'WAPI')).toBeNull();
  });

  it('shows Meta selected when Meta is the active visual provider', () => {
    expect(whatsappProviderBadge({ provider: 'META', available: true, configured: true }, 'META')).toBe('EM USO');
    expect(whatsappProviderBadgeState({ provider: 'META', available: true, configured: true }, 'META')).toBe('is-active');
    expect(whatsappProviderDraftMessage('META', 'META')).toBeNull();
  });

  it('treats clicking Meta from WAPI as draft selection until save', () => {
    expect(whatsappProviderDraftMessage('META', 'WAPI')).toBe(
      'Você está gerenciando uma opção diferente da conexão atual. A troca só acontece pelo botão de uso explícito.',
    );
  });

  it('shows the WAPI activation action when Meta is active and WAPI is selected', () => {
    expect(shouldShowWapiActivation('WAPI', 'META')).toBe(true);
    expect(whatsappProviderDraftMessage('WAPI', 'META')).toBe(
      'Você está gerenciando uma opção diferente da conexão atual. A troca só acontece pelo botão de uso explícito.',
    );
  });

  it('resets draft messaging when backend active provider is selected again after reload', () => {
    expect(whatsappProviderDraftMessage('META', 'WAPI')).not.toBeNull();
    expect(whatsappProviderDraftMessage('WAPI', 'WAPI')).toBeNull();
  });

  it('maps Meta template status to friendly visual icons', () => {
    expect(metaTemplateStatusIcon('APPROVED')).toBe('Aprovado');
    expect(metaTemplateStatusIcon('PENDING')).toBe('Em análise');
    expect(metaTemplateStatusIcon('REJECTED')).toBe('Rejeitado');
    expect(metaTemplateStatusIcon('UNKNOWN_STATUS')).toBe('Desconhecido');
  });

  it('labels provision button for empty, partial, complete and loading states', () => {
    expect(metaTemplateProvisionButtonLabel(undefined, false)).toBe('Criar templates padrão');
    expect(metaTemplateProvisionButtonLabel([{ exists: false }], false)).toBe('Criar templates padrão');
    expect(metaTemplateProvisionButtonLabel([{ exists: true }, { exists: false }], false)).toBe('Completar templates padrão');
    expect(metaTemplateProvisionButtonLabel([{ exists: true }], true)).toBe('Criando templates…');
  });

  it('detects when all standard Meta templates already exist', () => {
    expect(allMetaTemplatesCreated(undefined)).toBe(false);
    expect(allMetaTemplatesCreated([{ exists: true }, { exists: true }])).toBe(true);
    expect(allMetaTemplatesCreated([{ exists: true }, { exists: false }])).toBe(false);
  });
});
