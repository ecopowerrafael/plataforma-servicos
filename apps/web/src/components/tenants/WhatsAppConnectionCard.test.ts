import { describe, expect, it } from 'vitest';

import {
  shouldShowWapiActivation,
  whatsappProviderBadge,
  whatsappProviderBadgeState,
  whatsappProviderDraftMessage,
} from './WhatsAppConnectionCard.js';

describe('WhatsAppConnectionCard provider switching state', () => {
  it('marks Meta as available when backend says it is available', () => {
    expect(whatsappProviderBadge({ provider: 'META', available: true }, 'WAPI')).toBe('Disponível');
    expect(whatsappProviderBadgeState({ provider: 'META', available: true }, 'WAPI')).toBe('is-available');
  });

  it('keeps Meta visible as unavailable when backend says it is unavailable', () => {
    expect(whatsappProviderBadge({ provider: 'META', available: false }, 'WAPI')).toBe('Indisponível');
    expect(whatsappProviderBadgeState({ provider: 'META', available: false }, 'WAPI')).toBe('is-unavailable');
  });

  it('shows WAPI selected when WAPI is the active visual provider', () => {
    expect(whatsappProviderBadge({ provider: 'WAPI', available: true }, 'WAPI')).toBe('Selecionado');
    expect(whatsappProviderBadgeState({ provider: 'WAPI', available: true }, 'WAPI')).toBe('is-selected');
    expect(whatsappProviderDraftMessage('WAPI', 'WAPI')).toBeNull();
  });

  it('shows Meta selected when Meta is the active visual provider', () => {
    expect(whatsappProviderBadge({ provider: 'META', available: true }, 'META')).toBe('Selecionado');
    expect(whatsappProviderBadgeState({ provider: 'META', available: true }, 'META')).toBe('is-selected');
    expect(whatsappProviderDraftMessage('META', 'META')).toBeNull();
  });

  it('treats clicking Meta from WAPI as draft selection until save', () => {
    expect(whatsappProviderDraftMessage('META', 'WAPI')).toBe(
      'Meta ainda não configurada. Salve a Meta Cloud API para tornar este método ativo.',
    );
  });

  it('shows the WAPI activation action when Meta is active and WAPI is selected', () => {
    expect(shouldShowWapiActivation('WAPI', 'META')).toBe(true);
    expect(whatsappProviderDraftMessage('WAPI', 'META')).toBe(
      'W-API selecionada apenas para visualização. Clique em Usar W-API para reativar este método.',
    );
  });

  it('resets draft messaging when backend active provider is selected again after reload', () => {
    expect(whatsappProviderDraftMessage('META', 'WAPI')).not.toBeNull();
    expect(whatsappProviderDraftMessage('WAPI', 'WAPI')).toBeNull();
  });
});
