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
    expect(whatsappProviderBadge({ provider: 'META', available: true }, 'WAPI')).toBe('Configurado');
    expect(whatsappProviderBadgeState({ provider: 'META', available: true }, 'WAPI')).toBe('is-available');
  });

  it('keeps Meta visible as unavailable when backend says it is unavailable', () => {
    expect(whatsappProviderBadge({ provider: 'META', available: false }, 'WAPI')).toBe('Não configurado');
    expect(whatsappProviderBadgeState({ provider: 'META', available: false }, 'WAPI')).toBe('is-unavailable');
  });

  it('shows WAPI selected when WAPI is the active visual provider', () => {
    expect(whatsappProviderBadge({ provider: 'WAPI', available: true }, 'WAPI')).toBe('Configurando');
    expect(whatsappProviderBadgeState({ provider: 'WAPI', available: true }, 'WAPI')).toBe('is-selected');
    expect(whatsappProviderDraftMessage('WAPI', 'WAPI')).toBeNull();
  });

  it('shows Meta selected when Meta is the active visual provider', () => {
    expect(whatsappProviderBadge({ provider: 'META', available: true }, 'META')).toBe('Configurando');
    expect(whatsappProviderBadgeState({ provider: 'META', available: true }, 'META')).toBe('is-selected');
    expect(whatsappProviderDraftMessage('META', 'META')).toBeNull();
  });

  it('treats clicking Meta from WAPI as draft selection until save', () => {
    expect(whatsappProviderDraftMessage('META', 'WAPI')).toBe(
      'API Oficial aberta para configuração. A conexão ativa só muda quando você clicar em Usar API Oficial.',
    );
  });

  it('shows the WAPI activation action when Meta is active and WAPI is selected', () => {
    expect(shouldShowWapiActivation('WAPI', 'META')).toBe(true);
    expect(whatsappProviderDraftMessage('WAPI', 'META')).toBe(
      'API não oficial aberta para configuração. A conexão ativa só muda quando você clicar em Usar API não oficial.',
    );
  });

  it('resets draft messaging when backend active provider is selected again after reload', () => {
    expect(whatsappProviderDraftMessage('META', 'WAPI')).not.toBeNull();
    expect(whatsappProviderDraftMessage('WAPI', 'WAPI')).toBeNull();
  });

  it('maps Meta template status to friendly visual icons', () => {
    expect(metaTemplateStatusIcon('APPROVED')).toBe('🟢');
    expect(metaTemplateStatusIcon('PENDING')).toBe('🟡');
    expect(metaTemplateStatusIcon('REJECTED')).toBe('🔴');
    expect(metaTemplateStatusIcon('UNKNOWN_STATUS')).toBe('⚪');
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
