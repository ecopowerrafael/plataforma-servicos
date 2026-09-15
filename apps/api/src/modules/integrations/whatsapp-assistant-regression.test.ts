import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WHATSAPP_ASSISTANT_CONFIG,
  resolveAssistantConfig,
  renderPlaceholders,
} from './whatsapp-assistant-config.js';
import { firstNameOf } from './whatsapp-assistant.js';

/**
 * Testes de regressão para o fluxo de saudação customizável.
 * Simula o comportamento real de sendGreetingWithMenu() com configuração.
 */

describe('WhatsApp Assistant Regression - Greeting Flow', () => {
  describe('Fluxo padrão (sem customização)', () => {
    it('36. novo cliente → DEFAULT greeting sem {{customerName}}', () => {
      // Estado: tenant sem customização
      const config = resolveAssistantConfig(null); // null → DEFAULT
      const tenantName = 'Salão da Beleza';
      const customerName = null; // novo cliente

      // Escolhe template (novo cliente)
      const template = config.greeting.newCustomerBody;

      // Renderiza
      const message = renderPlaceholders(template, tenantName, customerName);

      // Esperado: greeting com tenantName, sem customerName
      expect(message).toContain('Salão da Beleza');
      expect(message).not.toContain('{{customerName}}');
    });

    it('37. cliente retornando → DEFAULT greeting com {{customerName}} renderizado', () => {
      // Estado: tenant sem customização
      const config = resolveAssistantConfig(null); // null → DEFAULT
      const tenantName = 'Salão da Beleza';
      const customerName = 'João Silva';
      const customerFirstName = firstNameOf(customerName); // 'João'

      // Escolhe template (cliente retornando)
      const template = config.greeting.returningCustomerBody;

      // Renderiza
      const message = renderPlaceholders(template, tenantName, customerFirstName);

      // Esperado: greeting com tenantName E primeiro nome
      expect(message).toContain('Salão da Beleza');
      expect(message).toContain('João');
    });

    it('38. greeting desabilitado → menu ativo sem saudação personalizada', () => {
      // Estado: tenant customizou greeting.enabled=false
      const customConfig = {
        greeting: {
          enabled: false,
          newCustomerBody: 'Custom novo (não usado)',
          returningCustomerBody: 'Custom retorno (não usado)',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 },
          ],
        },
      };
      const config = resolveAssistantConfig(customConfig);

      // Lógica em sendGreetingWithMenu:
      // if (greeting.enabled === false) → usa FALLBACK_PROMPT
      // menu continua normal (não desabilitado)

      expect(config.greeting.enabled).toBe(false);
      expect(config.menu.buttons[0]?.enabled).toBe(true); // menu não é desabilitado
    });
  });

  describe('Fluxo customizado', () => {
    it('39. customização simples → respeita label customizado', () => {
      // Estado: tenant customizou apenas label
      const customConfig = {
        greeting: {
          enabled: true,
          newCustomerBody: 'Olá! 👋\nBem-vindo à {{tenantName}}.\nComo posso ajudar?',
          returningCustomerBody: 'Olá, {{customerName}}! 👋\nBem-vindo novamente à {{tenantName}}.\nComo posso ajudar?',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar Consulta', enabled: true, order: 1 }, // customizado
            { actionId: 'MAIN_MENU_QUERY', label: 'Consultar agendamento', enabled: true, order: 2 },
          ],
        },
      };
      const config = resolveAssistantConfig(customConfig);

      // Menu contém label customizado
      const bookButton = config.menu.buttons.find((b) => b.actionId === 'MAIN_MENU_BOOK');
      expect(bookButton?.label).toBe('Agendar Consulta');
    });

    it('40. menu customizado → respeita ordem e habilitação', () => {
      // Estado: tenant reordenou e desabilitou alguns botões
      const customConfig = {
        greeting: {
          enabled: true,
          newCustomerBody: 'Olá!',
          returningCustomerBody: 'Bem-vindo!',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_QUERY', label: 'Consultar', enabled: true, order: 1 }, // 1º
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 2 }, // 2º
            { actionId: 'MAIN_MENU_CANCEL', label: 'Cancelar', enabled: false, order: 3 }, // desabilitado
          ],
        },
      };
      const config = resolveAssistantConfig(customConfig);

      // Simula filtro na rota: filter(btn => btn.enabled).sort((a,b) => a.order - b.order)
      const enabledButtons = config.menu.buttons.filter((b) => b.enabled).sort((a, b) => a.order - b.order);

      expect(enabledButtons).toHaveLength(2);
      expect(enabledButtons[0]?.actionId).toBe('MAIN_MENU_QUERY'); // primeiro
      expect(enabledButtons[1]?.actionId).toBe('MAIN_MENU_BOOK'); // segundo
    });
  });

  describe('Placeholders avançados', () => {
    it('41. múltiplos placeholders → todos renderizados', () => {
      // Tenant customizou com ambos placeholders
      const template = 'Olá {{customerName}}, bem-vindo à {{tenantName}}!';
      const rendered = renderPlaceholders(template, 'Academia', 'Maria');

      expect(rendered).toBe('Olá Maria, bem-vindo à Academia!');
    });

    it('42. placeholder tenantName sempre renderizado, mesmo sem customer', () => {
      // Novo cliente: template tem tenantName mas não customerName
      const template = 'Bem-vindo à {{tenantName}}, {{customerName}}';
      const rendered = renderPlaceholders(template, 'Clínica', null); // null customerName

      expect(rendered).toBe('Bem-vindo à Clínica, {{customerName}}'); // customerName não renderizado
    });

    it('43. sobrescrita de greeting pessoal → newCustomerBody personalizado', () => {
      // Tenant customizou greeting para novo cliente de forma pessoal
      const customConfig = {
        greeting: {
          enabled: true,
          newCustomerBody: 'Olá! Somos {{tenantName}}. Este é seu primeiro contato?',
          returningCustomerBody: 'Bem-vindo {{customerName}}! 😊',
        },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 },
          ],
        },
      };
      const config = resolveAssistantConfig(customConfig);

      const newCustomerGreeting = renderPlaceholders(config.greeting.newCustomerBody, 'Dentista Silva', null);
      expect(newCustomerGreeting).toBe('Olá! Somos Dentista Silva. Este é seu primeiro contato?');
    });
  });

  describe('Edge cases & integridade', () => {
    it('44. JSON nulo retorna DEFAULT completo', () => {
      const config = resolveAssistantConfig(null);

      // Verifica que DEFAULT tem todos campos esperados
      expect(config.greeting).toBeDefined();
      expect(config.greeting.enabled).toBe(true);
      expect(config.greeting.newCustomerBody).toBeDefined();
      expect(config.greeting.returningCustomerBody).toBeDefined();
      expect(config.menu).toBeDefined();
      expect(config.menu.buttons.length).toBe(5);
    });

    it('45. parsing de first name vazio → null', () => {
      const emptyName = firstNameOf(null);
      const blankName = firstNameOf('   ');

      expect(emptyName).toBeNull();
      expect(blankName).toBeNull();
    });

    it('46. parsing de first name com múltiplos espaços → extrai primeiro', () => {
      const fullName = 'João    Silva    dos    Santos';
      const firstName = firstNameOf(fullName);

      expect(firstName).toBe('João');
    });

    it('47. customerName em greeting novo rejeitado pela validação da rota', () => {
      // Template inválido: novo cliente não pode ter {{customerName}}
      const invalidTemplate = 'Olá {{customerName}}';

      // Na rota: validatePlaceholders(template, false) detecta erro
      // Este teste apenas confirma que é responsabilidade da rota, não da função
      // resolveAssistantConfig aceita qualquer string

      const config = resolveAssistantConfig({
        greeting: {
          enabled: true,
          newCustomerBody: invalidTemplate,
          returningCustomerBody: 'Bem-vindo',
        },
        menu: { buttons: [{ actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 }] },
      });

      // Função não valida; rota valida via validatePlaceholders()
      expect(config.greeting.newCustomerBody).toBe(invalidTemplate);
    });

    it('48. toggle greeting.enabled → muda fluxo (não desabilita menu)', () => {
      const configEnabled = {
        greeting: { enabled: true, newCustomerBody: 'Olá', returningCustomerBody: 'Bem-vindo' },
        menu: { buttons: [{ actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 }] },
      };

      const configDisabled = {
        greeting: { enabled: false, newCustomerBody: 'Olá', returningCustomerBody: 'Bem-vindo' },
        menu: { buttons: [{ actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 }] },
      };

      const resolved1 = resolveAssistantConfig(configEnabled);
      const resolved2 = resolveAssistantConfig(configDisabled);

      // Apenas greeting muda
      expect(resolved1.greeting.enabled).toBe(true);
      expect(resolved2.greeting.enabled).toBe(false);
      // Menu continua igual
      expect(resolved1.menu.buttons[0]?.label).toBe(resolved2.menu.buttons[0]?.label);
    });
  });

  describe('Automatic registration flow preservation', () => {
    it('49. cadastro automático não quebrado → processamento continua', () => {
      // Simula: hook provisionFromWhatsApp chama sendGreetingWithMenu
      // Config pode estar null (novo tenant) ou customizado (tenant existente)

      const newTenantConfig = resolveAssistantConfig(null); // novo tenant
      const existingTenantConfig = resolveAssistantConfig({
        greeting: { enabled: true, newCustomerBody: 'Olá!', returningCustomerBody: 'Bem-vindo!' },
        menu: { buttons: [{ actionId: 'MAIN_MENU_BOOK', label: 'Book', enabled: true, order: 1 }] },
      });

      // Ambos retornam config válida
      expect(newTenantConfig).toBeDefined();
      expect(existingTenantConfig).toBeDefined();
      expect(newTenantConfig.menu.buttons.length).toBeGreaterThan(0);
      expect(existingTenantConfig.menu.buttons.length).toBeGreaterThan(0);
    });

    it('50. menu habilitação respeita configuração → customizado ou default', () => {
      // Estado 1: tenant sem customizacao → todos 5 botões habilitados
      const defaultConfig = resolveAssistantConfig(null);
      const defaultEnabled = defaultConfig.menu.buttons.filter((b) => b.enabled);
      expect(defaultEnabled).toHaveLength(5);

      // Estado 2: tenant customizou → apenas 2 habilitados
      const customConfig = resolveAssistantConfig({
        greeting: { enabled: true, newCustomerBody: 'Olá', returningCustomerBody: 'Bem-vindo' },
        menu: {
          buttons: [
            { actionId: 'MAIN_MENU_BOOK', label: 'Agendar', enabled: true, order: 1 },
            { actionId: 'MAIN_MENU_QUERY', label: 'Consultar', enabled: true, order: 2 },
            { actionId: 'MAIN_MENU_RESCHEDULE', label: 'Reagendar', enabled: false, order: 3 },
            { actionId: 'MAIN_MENU_CANCEL', label: 'Cancelar', enabled: false, order: 4 },
            { actionId: 'MAIN_MENU_OTHER', label: 'Outros', enabled: false, order: 5 },
          ],
        },
      });
      const customEnabled = customConfig.menu.buttons.filter((b) => b.enabled);
      expect(customEnabled).toHaveLength(2);
    });
  });
});
