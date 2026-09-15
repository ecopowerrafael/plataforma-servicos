import { z } from 'zod';

/**
 * Configuração do atendimento automático do WhatsApp.
 * Inclui saudação personalizada e menu principal customizável.
 */

export const ALLOWED_ASSISTANT_ACTION_IDS = [
  'MAIN_MENU_BOOK',
  'MAIN_MENU_QUERY',
  'MAIN_MENU_RESCHEDULE',
  'MAIN_MENU_CANCEL',
  'MAIN_MENU_OTHER',
] as const;

export type AllowedAssistantActionId = (typeof ALLOWED_ASSISTANT_ACTION_IDS)[number];

export const WhatsAppAssistantMenuButtonSchema = z.object({
  actionId: z.enum(ALLOWED_ASSISTANT_ACTION_IDS),
  label: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  order: z.number().int().min(1).max(10),
});

export const WhatsAppAssistantGreetingSchema = z.object({
  enabled: z.boolean().default(true),
  newCustomerBody: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .default('Olá! 👋\nBem-vindo à {{tenantName}}.\nComo posso ajudar?'),
  returningCustomerBody: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .default('Olá, {{customerName}}! 👋\nBem-vindo novamente à {{tenantName}}.\nComo posso ajudar?'),
});

export const WhatsAppAssistantMenuSchema = z.object({
  buttons: z
    .array(WhatsAppAssistantMenuButtonSchema)
    .min(1, 'Pelo menos um botão do menu deve estar ativo')
    .refine(
      (buttons) => buttons.some((b) => b.enabled),
      'Pelo menos um botão do menu deve estar habilitado',
    )
    .refine(
      (buttons) => {
        const actionIds = buttons.map((b) => b.actionId);
        return new Set(actionIds).size === actionIds.length;
      },
      'Cada botão deve ter um actionId único',
    )
    .refine(
      (buttons) => {
        const orders = buttons.map((b) => b.order);
        return new Set(orders).size === orders.length;
      },
      'Cada botão deve ter uma posição (order) única',
    ),
});

export const WhatsAppAssistantConfigSchema = z.object({
  greeting: WhatsAppAssistantGreetingSchema,
  menu: WhatsAppAssistantMenuSchema,
});

export type WhatsAppAssistantMenuButton = z.infer<typeof WhatsAppAssistantMenuButtonSchema>;
export type WhatsAppAssistantGreeting = z.infer<typeof WhatsAppAssistantGreetingSchema>;
export type WhatsAppAssistantMenu = z.infer<typeof WhatsAppAssistantMenuSchema>;
export type WhatsAppAssistantConfig = z.infer<typeof WhatsAppAssistantConfigSchema>;

export const DEFAULT_WHATSAPP_ASSISTANT_CONFIG: WhatsAppAssistantConfig = {
  greeting: {
    enabled: true,
    newCustomerBody: 'Olá! 👋\nBem-vindo à {{tenantName}}.\nComo posso ajudar?',
    returningCustomerBody: 'Olá, {{customerName}}! 👋\nBem-vindo novamente à {{tenantName}}.\nComo posso ajudar?',
  },
  menu: {
    buttons: [
      {
        actionId: 'MAIN_MENU_BOOK',
        label: 'Agendar horário',
        enabled: true,
        order: 1,
      },
      {
        actionId: 'MAIN_MENU_QUERY',
        label: 'Consultar agendamento',
        enabled: true,
        order: 2,
      },
      {
        actionId: 'MAIN_MENU_RESCHEDULE',
        label: 'Reagendar',
        enabled: true,
        order: 3,
      },
      {
        actionId: 'MAIN_MENU_CANCEL',
        label: 'Cancelar agendamento',
        enabled: true,
        order: 4,
      },
      {
        actionId: 'MAIN_MENU_OTHER',
        label: 'Outros assuntos',
        enabled: true,
        order: 5,
      },
    ],
  },
};

/**
 * Valida e retorna a configuração assistente para um tenant.
 * Se assistantConfig é null, retorna DEFAULT_WHATSAPP_ASSISTANT_CONFIG.
 * Se há override, valida e retorna customização.
 */
export function resolveAssistantConfig(
  assistantConfig: unknown,
): WhatsAppAssistantConfig {
  if (assistantConfig === null || assistantConfig === undefined) {
    return DEFAULT_WHATSAPP_ASSISTANT_CONFIG;
  }

  const result = WhatsAppAssistantConfigSchema.safeParse(assistantConfig);
  if (!result.success) {
    console.warn('Invalid assistant config for tenant, falling back to defaults:', result.error);
    return DEFAULT_WHATSAPP_ASSISTANT_CONFIG;
  }

  return result.data;
}

/**
 * Renderiza placeholders em um template de texto.
 * Permitidos: {{tenantName}}, {{customerName}} (conforme contexto).
 */
export function renderPlaceholders(
  template: string,
  tenantName: string,
  customerName?: string | null,
): string {
  let result = template.replace(/\{\{tenantName\}\}/g, tenantName);
  if (customerName) {
    result = result.replace(/\{\{customerName\}\}/g, customerName);
  }
  return result;
}

/**
 * Valida placeholders permitidos em um template.
 * newCustomerBody: apenas {{tenantName}}
 * returningCustomerBody: {{tenantName}} e {{customerName}}
 */
export function validatePlaceholders(template: string, allowCustomerName: boolean): string | null {
  const allowedPatterns = allowCustomerName
    ? [/\{\{tenantName\}\}/g, /\{\{customerName\}\}/g]
    : [/\{\{tenantName\}\}/g];

  const invalidPattern = /\{\{[^}]+\}\}/g;
  const found = template.match(invalidPattern) || [];
  const allowed = new Set<string>();

  for (const pattern of allowedPatterns) {
    const matches = template.match(pattern) || [];
    matches.forEach((m) => allowed.add(m));
  }

  for (const match of found) {
    if (!allowed.has(match)) {
      return `Placeholder inválido: ${match}`;
    }
  }

  return null;
}
