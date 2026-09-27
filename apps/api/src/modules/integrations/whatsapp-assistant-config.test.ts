import { describe, it, expect } from 'vitest';

import {
  WhatsAppAssistantConfigSchema,
  DEFAULT_WHATSAPP_ASSISTANT_CONFIG,
  resolveAssistantConfig,
  renderPlaceholders,
  validatePlaceholders,
} from './whatsapp-assistant-config.js';

describe('WhatsApp Assistant Config', () => {
  describe('resolveAssistantConfig', () => {
    it('1. null → DEFAULT_WHATSAPP_ASSISTANT_CONFIG', () => {
      const result = resolveAssistantConfig(null);
      expect(result).toEqual(DEFAULT_WHATSAPP_ASSISTANT_CONFIG);
    });

    it('2. undefined → DEFAULT_WHATSAPP_ASSISTANT_CONFIG', () => {
      const result = resolveAssistantConfig(undefined);
      expect(result).toEqual(DEFAULT_WHATSAPP_ASSISTANT_CONFIG);
    });

    it('3. config válida → override', () => {
      const custom = {
        greeting: {
          enabled: true,
          newCustomerBody: 'Custom novo',
          returningCustomerBody: 'Custom retornando',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 },
          ],
        },
      };
      const result = resolveAssistantConfig(custom);
      expect(result.greeting.newCustomerBody).toBe('Custom novo');
    });

    it('4. JSON inválido → fallback default sem throw', () => {
      const result = resolveAssistantConfig({ invalid: 'data' });
      expect(result).toEqual(DEFAULT_WHATSAPP_ASSISTANT_CONFIG);
    });
  });

  describe('validatePlaceholders', () => {
    it('5. newCustomerBody aceita {{tenantName}}', () => {
      const template = 'Bem-vindo à {{tenantName}}';
      const error = validatePlaceholders(template, false);
      expect(error).toBeNull();
    });

    it('6. newCustomerBody rejeita {{customerName}}', () => {
      const template = 'Bem-vindo {{customerName}}';
      const error = validatePlaceholders(template, false);
      expect(error).toContain('Placeholder inválido');
    });

    it('7. returningCustomerBody aceita {{tenantName}}', () => {
      const template = 'Bem-vindo à {{tenantName}}';
      const error = validatePlaceholders(template, true);
      expect(error).toBeNull();
    });

    it('8. returningCustomerBody aceita {{customerName}}', () => {
      const template = 'Bem-vindo {{customerName}} à {{tenantName}}';
      const error = validatePlaceholders(template, true);
      expect(error).toBeNull();
    });

    it('9. placeholder desconhecido rejeitado', () => {
      const template = 'Bem-vindo {{unknownPlaceholder}}';
      const error = validatePlaceholders(template, true);
      expect(error).toContain('Placeholder inválido');
    });
  });

  describe('renderPlaceholders', () => {
    it('13. renderPlaceholders substitui tenantName', () => {
      const template = 'Bem-vindo à {{tenantName}}';
      const result = renderPlaceholders(template, 'Meu Negócio', null);
      expect(result).toBe('Bem-vindo à Meu Negócio');
    });

    it('14. renderPlaceholders substitui customerName', () => {
      const template = 'Bem-vindo {{customerName}}';
      const result = renderPlaceholders(template, 'Salão', 'João');
      expect(result).toBe('Bem-vindo João');
    });

    it('15. renderPlaceholders com ambos', () => {
      const template = 'Olá {{customerName}}, bem-vindo à {{tenantName}}';
      const result = renderPlaceholders(template, 'Salão', 'Maria');
      expect(result).toBe('Olá Maria, bem-vindo à Salão');
    });
  });

  describe('Schema validation', () => {
    it('16. label vazia rejeitada', () => {
      const invalid = {
        greeting: {
          enabled: true,
          newCustomerBody: 'Olá',
          returningCustomerBody: 'Olá',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: '', enabled: true, order: 1 },
          ],
        },
      };
      const result = WhatsAppAssistantConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('17. body vazio rejeitado', () => {
      const invalid = {
        greeting: {
          enabled: true,
          newCustomerBody: '',
          returningCustomerBody: 'Olá',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 },
          ],
        },
      };
      const result = WhatsAppAssistantConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('18. actionId fora da whitelist rejeitado', () => {
      const invalid = {
        greeting: {
          enabled: true,
          newCustomerBody: 'Olá',
          returningCustomerBody: 'Olá',
        },
        menu: {
          buttons: [
            { actionId: 'INVALID_ACTION', label: 'Teste', enabled: true, order: 1 },
          ],
        },
      };
      const result = WhatsAppAssistantConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('19. todos buttons disabled rejeitado', () => {
      const invalid = {
        greeting: {
          enabled: true,
          newCustomerBody: 'Olá',
          returningCustomerBody: 'Olá',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: false, order: 1 },
            { actionId: 'MAIN_MENU_QUERY', label: 'Consultar', enabled: false, order: 2 },
          ],
        },
      };
      const result = WhatsAppAssistantConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('20. actionId duplicada rejeitada', () => {
      const invalid = {
        greeting: {
          enabled: true,
          newCustomerBody: 'Olá',
          returningCustomerBody: 'Olá',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 },
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar Again', enabled: true, order: 2 },
          ],
        },
      };
      const result = WhatsAppAssistantConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('actionId único');
    });

    it('21. order duplicada rejeitada', () => {
      const invalid = {
        greeting: {
          enabled: true,
          newCustomerBody: 'Olá',
          returningCustomerBody: 'Olá',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 },
            { actionId: 'MAIN_MENU_QUERY', label: 'Consultar', enabled: true, order: 1 },
          ],
        },
      };
      const result = WhatsAppAssistantConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('posição');
    });
  });
});
