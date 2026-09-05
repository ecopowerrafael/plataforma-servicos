import { randomUUID } from 'node:crypto';

import {
  NotificationKinds,
  NotificationTemplateListResponseSchema,
  type NotificationKindSchema,
  type UpdateNotificationTemplateRequestSchema,
} from '@plataforma/shared';
import { type z } from 'zod';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

export interface WhatsAppButton {
  actionKey: string;
  label: string;
  enabled: boolean;
  order: number;
}

export type WhatsAppActionKey = 'CONFIRM_APPOINTMENT' | 'RESCHEDULE_APPOINTMENT' | 'CANCEL_APPOINTMENT';

const WHATSAPP_ACTION_KEYS: Set<WhatsAppActionKey> = new Set([
  'CONFIRM_APPOINTMENT',
  'RESCHEDULE_APPOINTMENT',
  'CANCEL_APPOINTMENT',
]);

export type NotificationKind = z.infer<typeof NotificationKindSchema>;
type UpdateInput = z.infer<typeof UpdateNotificationTemplateRequestSchema>;

export interface TemplateContent {
  subject: string;
  body: string;
  title?: string | undefined;
  intro?: string | undefined;
  afterText?: string | undefined;
  ctaLabel?: string | undefined;
}

const EMAIL_TEMPLATE_PREFIX = '__AG_EMAIL_TEMPLATE_V1__';

const APPOINTMENT_VARIABLES = new Set([
  'customerName',
  'tenantName',
  'serviceName',
  'professionalName',
  'when',
  'protocol',
  'canceledReasonLine',
  'date',
  'time',
  'unitName',
  'value',
  'appointmentUrl',
  'isToday',
  'professionalPhrase',
]);
const RECOVERY_VARIABLES = new Set(['customerName', 'tenantName', 'referenceDate']);
const TREATMENT_VARIABLES = new Set([
  'customerName',
  'tenantName',
  'treatmentTitle',
  'amountLine',
  'sessionsLine',
  'estimatedTotalLine',
  'intervalLine',
  'professionalName',
  'treatmentUrl',
]);

const WHATSAPP_ALLOWED_ACTIONS_BY_KIND: Partial<Record<NotificationKind, Set<WhatsAppActionKey>>> = {
  'appointment.booking_confirmed': new Set(['CONFIRM_APPOINTMENT', 'RESCHEDULE_APPOINTMENT']),
  'appointment.day_before_reminder': new Set(['CONFIRM_APPOINTMENT', 'RESCHEDULE_APPOINTMENT']),
  'appointment.upcoming_reminder': new Set(['CONFIRM_APPOINTMENT']),
  'appointment.booking_canceled': new Set([]),
};

const DEFAULT_WHATSAPP_BUTTONS: Partial<Record<NotificationKind, WhatsAppButton[]>> = {
  'appointment.booking_confirmed': [
    { actionKey: 'CONFIRM_APPOINTMENT', label: 'Confirmar agendamento', enabled: true, order: 1 },
    { actionKey: 'RESCHEDULE_APPOINTMENT', label: 'Reagendar', enabled: true, order: 2 },
  ],
  'appointment.day_before_reminder': [
    { actionKey: 'CONFIRM_APPOINTMENT', label: 'Confirmar presença', enabled: true, order: 1 },
    { actionKey: 'RESCHEDULE_APPOINTMENT', label: 'Reagendar', enabled: true, order: 2 },
  ],
  'appointment.upcoming_reminder': [
    { actionKey: 'CONFIRM_APPOINTMENT', label: 'Confirmar', enabled: true, order: 1 },
  ],
};

function assertSupportedVariables(
  kind: NotificationKind,
  values: Array<string | null | undefined>,
) {
  const supported = kind.startsWith('appointment.')
    ? APPOINTMENT_VARIABLES
    : kind.startsWith('treatment_plan.')
      ? TREATMENT_VARIABLES
      : RECOVERY_VARIABLES;
  for (const value of values) {
    if (value === null || value === undefined) continue;
    for (const token of value.matchAll(/\{\{(\w+)\}\}/g)) {
      const variable = token[1];
      if (variable === undefined) continue;
      if (!supported.has(variable))
        throw new AppError({
          code: 'NOTIFICATION_TEMPLATE_VARIABLE_UNKNOWN',
          message: `A variável {{${variable}}} não é suportada por este modelo.`,
          statusCode: 400,
        });
    }
  }
}

function validateAndNormalizeWhatsAppButtons(
  kind: NotificationKind,
  buttons: unknown,
): WhatsAppButton[] {
  if (buttons === null || buttons === undefined) {
    return DEFAULT_WHATSAPP_BUTTONS[kind] ?? [];
  }
  if (!Array.isArray(buttons)) {
    throw new AppError({
      code: 'INVALID_WHATSAPP_BUTTONS',
      message: 'Botões WhatsApp devem ser um array.',
      statusCode: 400,
    });
  }
  const allowed = WHATSAPP_ALLOWED_ACTIONS_BY_KIND[kind] ?? new Set();
  const normalized: WhatsAppButton[] = [];
  for (const btn of buttons) {
    if (typeof btn !== 'object' || btn === null) continue;
    const obj = btn as Record<string, unknown>;
    const actionKey = obj.actionKey as string | undefined;
    if (typeof actionKey !== 'string' || !WHATSAPP_ACTION_KEYS.has(actionKey as WhatsAppActionKey)) {
      throw new AppError({
        code: 'INVALID_ACTION_KEY',
        message: `actionKey inválida: ${actionKey}`,
        statusCode: 400,
      });
    }
    if (!allowed.has(actionKey as WhatsAppActionKey)) {
      throw new AppError({
        code: 'ACTION_NOT_ALLOWED_FOR_KIND',
        message: `A ação ${actionKey} não é permitida para este tipo de notificação.`,
        statusCode: 400,
      });
    }
    const label = obj.label as string | undefined;
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new AppError({
        code: 'INVALID_BUTTON_LABEL',
        message: 'Label do botão é obrigatório e não pode ser vazio.',
        statusCode: 400,
      });
    }
    const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : true;
    const order = typeof obj.order === 'number' ? Math.max(1, obj.order) : normalized.length + 1;
    normalized.push({ actionKey: actionKey as WhatsAppActionKey, label: label.trim(), enabled, order });
  }
  return normalized;
}

const DEFAULT_WHATSAPP_TEMPLATES: Partial<Record<NotificationKind, string>> = {
  'appointment.booking_confirmed':
    'Ola, {{customerName}}! Seu agendamento de {{serviceName}}{{professionalPhrase}} foi confirmado para {{date}} as {{time}}.',
  'appointment.reminder':
    'Ola, {{customerName}}! Lembrete: seu agendamento de {{serviceName}}{{professionalPhrase}} e {{date}} as {{time}}.',
  'appointment.day_before_reminder':
    'Ola, {{customerName}}! Lembrete: seu agendamento de {{serviceName}}{{professionalPhrase}} é amanha às {{time}}.',
  'appointment.upcoming_reminder':
    'Ola, {{customerName}}! Seu agendamento de {{serviceName}}{{professionalPhrase}} começa em breve, às {{time}}.',
  'appointment.booking_canceled':
    'Ola, {{customerName}}. Seu agendamento de {{serviceName}} para {{date}} as {{time}} foi cancelado.',
  'customer.recovery.inactive':
    'Ola, {{customerName}}! Sentimos sua falta desde sua última visita em {{referenceDate}}. Quando quiser voltar, estamos à disposição!',
  'customer.recovery.canceled':
    'Ola, {{customerName}}! Notamos que seu atendimento de {{referenceDate}} foi cancelado. Gostaria de reagendar com a gente?',
  'customer.recovery.no_show':
    'Ola, {{customerName}}! Você não pôde comparecer ao atendimento de {{referenceDate}}. Podemos ajudar com um novo horário?',
  'customer.recovery.post_service':
    'Ola, {{customerName}}! Já faz um tempo desde seu atendimento de {{referenceDate}}. Quando precisar, estamos à disposição!',
  'customer.recovery.birthday':
    'Ola, {{customerName}}! Feliz aniversário! 🎉 Desejamos um excelente novo ciclo. Conte conosco quando precisar!',
};

const DEFAULT_TEMPLATES: Record<NotificationKind, TemplateContent> = {
  'appointment.booking_confirmed': {
    subject: 'Seu agendamento foi confirmado — {{tenantName}}',
    body: 'Olá, {{customerName}}!\n\nSeu agendamento foi confirmado.\n\nServiço: {{serviceName}}\nProfissional: {{professionalName}}\nData/hora: {{when}}\nProtocolo: {{protocol}}',
    title: 'Seu agendamento está confirmado',
    intro: 'Olá, {{customerName}}! Seu horário foi reservado com sucesso.',
    afterText:
      'Você pode acompanhar, reagendar ou cancelar pelo aplicativo, conforme as regras do estabelecimento.',
    ctaLabel: 'Ver meu agendamento',
  },
  'appointment.booking_canceled': {
    subject: 'Agendamento cancelado — {{tenantName}}',
    body: 'Olá, {{customerName}}!\n\nSeu agendamento foi cancelado.\n\nServiço: {{serviceName}}\nProfissional: {{professionalName}}\nData/hora: {{when}}\nProtocolo: {{protocol}}{{canceledReasonLine}}',
    title: 'Agendamento cancelado',
    intro: 'Olá, {{customerName}}. Seu agendamento foi cancelado.',
    afterText: 'Se precisar, você pode escolher um novo horário pelo aplicativo.',
    ctaLabel: 'Ver agendamentos',
  },
  'appointment.reminder': {
    subject: 'Lembrete do seu agendamento — {{tenantName}}',
    body: 'Olá, {{customerName}}. Seu agendamento está chegando.\n\nServiço: {{serviceName}}\nProfissional: {{professionalName}}\nData/hora: {{when}}\nProtocolo: {{protocol}}',
    title: 'Lembrete de agendamento',
    intro: 'Olá, {{customerName}}. Seu agendamento está chegando.',
    afterText: 'Consulte os detalhes do horário pelo aplicativo.',
    ctaLabel: 'Ver agendamento',
  },
  'appointment.day_before_reminder': {
    subject: 'Lembrete: seu agendamento é amanhã — {{tenantName}}',
    body: 'Olá, {{customerName}}. Seu agendamento está marcado para amanhã!\n\nServiço: {{serviceName}}\nProfissional: {{professionalName}}\nHorário: {{time}}\nProtocolo: {{protocol}}',
    title: 'Lembrete: agendamento amanhã',
    intro: 'Olá, {{customerName}}. Seu agendamento é amanhã!',
    afterText: 'Confirme comparecimento ou reagende pelo aplicativo, se necessário.',
    ctaLabel: 'Ver agendamento',
  },
  'appointment.upcoming_reminder': {
    subject: 'Seu agendamento começa em breve — {{tenantName}}',
    body: 'Olá, {{customerName}}. Seu agendamento está começando!\n\nServiço: {{serviceName}}\nProfissional: {{professionalName}}\nHorário: {{time}}\nProtocolo: {{protocol}}',
    title: 'Agendamento começando agora',
    intro: 'Olá, {{customerName}}. Seu agendamento está começando!',
    afterText: 'Acesse o aplicativo para mais detalhes ou contate o estabelecimento.',
    ctaLabel: 'Ver agendamento',
  },
  'customer.recovery.inactive': {
    subject: 'Sentimos sua falta, {{customerName}}',
    body: 'Olá, {{customerName}}! Sentimos sua falta desde sua última visita em {{referenceDate}}. Quando quiser, estamos à disposição.',
  },
  'customer.recovery.canceled': {
    subject: 'Que tal remarcar seu atendimento?',
    body: 'Olá, {{customerName}}! Notamos que seu atendimento de {{referenceDate}} foi cancelado e ainda não houve reagendamento.',
  },
  'customer.recovery.no_show': {
    subject: 'Podemos ajudar com um novo horário?',
    body: 'Olá, {{customerName}}! Você não pôde comparecer ao atendimento de {{referenceDate}}. Estamos à disposição para um novo horário.',
  },
  'customer.recovery.post_service': {
    subject: 'Como foi seu atendimento?',
    body: 'Olá, {{customerName}}! Já faz um tempo desde seu atendimento de {{referenceDate}}. Quando precisar, conte conosco.',
  },
  'customer.recovery.birthday': {
    subject: 'Feliz aniversário, {{customerName}}!',
    body: 'Olá, {{customerName}}! Desejamos um feliz aniversário e um excelente novo ciclo.',
  },
  'treatment_plan.quote_ready': {
    subject: 'Seu orçamento está pronto — {{tenantName}}',
    body: "Olá, {{customerName}}! O orçamento para o tratamento '{{treatmentTitle}}' já foi definido.\n\n{{amountLine}}{{sessionsLine}}{{estimatedTotalLine}}{{intervalLine}}\n\nAcesse sua conta para revisar e aprovar o orçamento.",
    title: 'Seu orçamento está pronto',
    intro: "Olá, {{customerName}}! O orçamento para '{{treatmentTitle}}' já está disponível.",
    afterText: 'Revise os valores e aprove pela sua conta quando quiser.',
    ctaLabel: 'Ver orçamento',
  },
  'treatment_plan.approved': {
    subject: 'Orçamento aprovado — {{treatmentTitle}}',
    body: "{{customerName}} aprovou o orçamento '{{treatmentTitle}}'.\n\n{{amountLine}}{{sessionsLine}}\n\nPrimeira sessão ainda não agendada.",
    title: 'Orçamento aprovado',
    intro: "{{customerName}} aprovou o orçamento '{{treatmentTitle}}'.",
    afterText: 'Primeira sessão ainda não agendada.',
    ctaLabel: 'Ver tratamento',
  },
};

export function renderTemplate(
  template: TemplateContent,
  variables: Record<string, string>,
): TemplateContent {
  const substitute = (input: string) =>
    input.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? '');
  const substituteSubject = (input: string) =>
    input.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      key === 'protocol' ? '' : (variables[key] ?? ''),
    );
  return {
    subject: substituteSubject(template.subject),
    body: substitute(template.body),
    ...(template.title === undefined ? {} : { title: substitute(template.title) }),
    ...(template.intro === undefined ? {} : { intro: substitute(template.intro) }),
    ...(template.afterText === undefined ? {} : { afterText: substitute(template.afterText) }),
    ...(template.ctaLabel === undefined ? {} : { ctaLabel: substitute(template.ctaLabel) }),
  };
}

function decodeStoredTemplate(
  value: { subject: string; body: string },
  fallback: TemplateContent,
): TemplateContent {
  if (!value.body.startsWith(EMAIL_TEMPLATE_PREFIX)) return { ...fallback, ...value };
  try {
    const parsed = JSON.parse(
      value.body.slice(EMAIL_TEMPLATE_PREFIX.length),
    ) as Partial<TemplateContent>;
    return {
      ...fallback,
      subject: value.subject,
      body: typeof parsed.body === 'string' ? parsed.body : fallback.body,
      title: typeof parsed.title === 'string' ? parsed.title : fallback.title,
      intro: typeof parsed.intro === 'string' ? parsed.intro : fallback.intro,
      afterText: typeof parsed.afterText === 'string' ? parsed.afterText : fallback.afterText,
      ctaLabel: typeof parsed.ctaLabel === 'string' ? parsed.ctaLabel : fallback.ctaLabel,
    };
  } catch {
    return { ...fallback, ...value };
  }
}

export function renderPushTemplate(
  kind: NotificationKind,
  variables: Record<string, string>,
): TemplateContent {
  const professional = variables.professionalName?.trim();
  const withProfessional =
    professional === undefined || professional === '' ? '' : ` com ${professional}`;
  if (kind === 'appointment.booking_confirmed')
    return {
      subject: 'Agendamento confirmado',
      body: `Seu horário para ${variables.serviceName ?? 'o serviço'}${withProfessional} está confirmado para ${variables.date ?? ''} às ${variables.time ?? ''}.`,
    };
  if (kind === 'appointment.reminder')
    return {
      subject: 'Lembrete de agendamento',
      body: `Seu horário para ${variables.serviceName ?? 'o serviço'}${withProfessional} é ${variables.isToday === 'true' ? 'hoje' : (variables.date ?? '')} às ${variables.time ?? ''}.`,
    };
  if (kind === 'appointment.day_before_reminder')
    return {
      subject: 'Lembrete: agendamento amanhã',
      body: `Seu horário para ${variables.serviceName ?? 'o serviço'}${withProfessional} é amanhã às ${variables.time ?? ''}.`,
    };
  if (kind === 'appointment.upcoming_reminder')
    return {
      subject: 'Agendamento começando agora',
      body: `Seu horário para ${variables.serviceName ?? 'o serviço'}${withProfessional} está começando agora às ${variables.time ?? ''}.`,
    };
  if (kind === 'treatment_plan.quote_ready')
    return {
      subject: 'Seu orçamento está pronto',
      body: `${variables.treatmentTitle ?? 'Seu tratamento'} — ${(variables.amountLine ?? '').trim()}`.trim(),
    };
  if (kind === 'treatment_plan.approved')
    return {
      subject: 'Orçamento aprovado',
      body: `${variables.customerName ?? 'O cliente'} aprovou '${variables.treatmentTitle ?? 'o tratamento'}'.`,
    };
  if (kind === 'appointment.booking_canceled')
    return {
      subject: 'Agendamento cancelado',
      body: `Seu agendamento de ${variables.serviceName ?? 'serviço'} para ${variables.date ?? ''} às ${variables.time ?? ''} foi cancelado.`,
    };
  return renderTemplate(DEFAULT_TEMPLATES[kind], variables);
}

export class NotificationTemplateService {
  public constructor(private readonly client: PrismaClient) {}

  public async list(tenantId: bigint) {
    const customs = await this.client.notificationTemplate.findMany({ where: { tenantId } });
    const byKind = new Map(customs.map((item) => [item.kind, item]));
    return NotificationTemplateListResponseSchema.parse({
      items: NotificationKinds.map((kind) => {
        const custom = byKind.get(kind);
        const fallback = DEFAULT_TEMPLATES[kind];
        const resolved = custom === undefined ? fallback : decodeStoredTemplate(custom, fallback);
        return {
          kind,
          subject: resolved.subject,
          body: resolved.body,
          title: resolved.title ?? '',
          intro: resolved.intro ?? '',
          afterText: resolved.afterText ?? '',
          ctaLabel: resolved.ctaLabel ?? '',
          whatsappBody: custom?.whatsappBody ?? DEFAULT_WHATSAPP_TEMPLATES[kind] ?? resolved.body,
          isCustom: custom !== undefined,
        };
      }),
    });
  }

  public async update(
    tenantId: bigint,
    kind: NotificationKind,
    input: UpdateInput & { whatsappEnabled?: boolean; whatsappButtons?: unknown },
  ): Promise<void> {
    if (input.subject === null || input.body === null) {
      await this.client.notificationTemplate.deleteMany({ where: { tenantId, kind } });
      return;
    }
    assertSupportedVariables(kind, [
      input.subject,
      input.body,
      input.title,
      input.intro,
      input.afterText,
      input.ctaLabel,
      input.whatsappBody,
    ]);
    const normalizedButtons = validateAndNormalizeWhatsAppButtons(kind, input.whatsappButtons);
    const existing = await this.client.notificationTemplate.findFirst({
      where: { tenantId, kind },
      select: { id: true },
    });
    const fallback = DEFAULT_TEMPLATES[kind];
    const storedBody =
      kind === 'appointment.booking_confirmed'
        ? `${EMAIL_TEMPLATE_PREFIX}${JSON.stringify({
            body: input.body,
            title: input.title ?? fallback.title,
            intro: input.intro ?? fallback.intro,
            afterText: input.afterText ?? fallback.afterText,
            ctaLabel: input.ctaLabel ?? fallback.ctaLabel,
          })}`
        : input.body;
    if (existing === null) {
      await this.client.notificationTemplate.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          kind,
          subject: input.subject,
          body: storedBody,
          whatsappBody: input.whatsappBody ?? DEFAULT_WHATSAPP_TEMPLATES[kind] ?? null,
          whatsappEnabled: input.whatsappEnabled ?? true,
          whatsappButtons: normalizedButtons.length > 0 ? (normalizedButtons as any) : null,
        },
      });
      return;
    }
    const updateData: any = {
      subject: input.subject,
      body: storedBody,
    };
    if (input.whatsappBody !== undefined) updateData.whatsappBody = input.whatsappBody;
    if (input.whatsappEnabled !== undefined) updateData.whatsappEnabled = input.whatsappEnabled;
    if (input.whatsappButtons !== undefined) updateData.whatsappButtons = normalizedButtons.length > 0 ? (normalizedButtons as any) : null;
    await this.client.notificationTemplate.update({
      where: { id: existing.id },
      data: updateData,
    });
  }

  public async render(
    tenantId: bigint,
    kind: NotificationKind,
    variables: Record<string, string>,
  ): Promise<TemplateContent> {
    const custom = await this.client.notificationTemplate.findFirst({ where: { tenantId, kind } });
    const fallback = DEFAULT_TEMPLATES[kind];
    return renderTemplate(
      custom === null ? fallback : decodeStoredTemplate(custom, fallback),
      variables,
    );
  }

  public async renderWhatsApp(
    tenantId: bigint,
    kind: NotificationKind,
    variables: Record<string, string>,
  ): Promise<string | null> {
    const custom = await this.client.notificationTemplate.findFirst({ where: { tenantId, kind } });
    if (custom?.whatsappEnabled === false) return null;
    const template =
      custom?.whatsappBody ?? DEFAULT_WHATSAPP_TEMPLATES[kind] ?? DEFAULT_TEMPLATES[kind].body;
    const professional = variables.professionalName?.trim() ?? '';
    return renderTemplate(
      { subject: '', body: template },
      { ...variables, professionalPhrase: professional === '' ? '' : ` com ${professional}` },
    ).body;
  }

  public async getWhatsAppButtons(tenantId: bigint, kind: NotificationKind): Promise<WhatsAppButton[]> {
    const custom = await this.client.notificationTemplate.findFirst({ where: { tenantId, kind } });
    const buttons = custom?.whatsappButtons as unknown as WhatsAppButton[] | null | undefined;
    if (buttons !== null && buttons !== undefined && Array.isArray(buttons)) {
      return validateAndNormalizeWhatsAppButtons(kind, buttons);
    }
    return DEFAULT_WHATSAPP_BUTTONS[kind] ?? [];
  }

  public async isWhatsAppEnabled(tenantId: bigint, kind: NotificationKind): Promise<boolean> {
    const custom = await this.client.notificationTemplate.findFirst({ where: { tenantId, kind } });
    return custom?.whatsappEnabled ?? true;
  }

  public async getWhatsAppInfo(tenantId: bigint, kind: NotificationKind) {
    const custom = await this.client.notificationTemplate.findFirst({ where: { tenantId, kind } });
    const isEnabled = custom?.whatsappEnabled ?? true;
    const buttons = custom?.whatsappButtons as unknown as WhatsAppButton[] | null | undefined;
    const normalizedButtons = validateAndNormalizeWhatsAppButtons(kind, buttons);
    const body = custom?.whatsappBody ?? DEFAULT_WHATSAPP_TEMPLATES[kind];
    const allowed = WHATSAPP_ALLOWED_ACTIONS_BY_KIND[kind] ?? new Set();
    return {
      kind,
      enabled: isEnabled,
      body: body ?? null,
      buttons: normalizedButtons,
      allowedActions: Array.from(allowed),
      isCustomized: custom !== null,
      placeholders: this.getPlaceholdersForKind(kind),
    };
  }

  public getPlaceholdersForKind(kind: NotificationKind): string[] {
    const supported = kind.startsWith('appointment.')
      ? APPOINTMENT_VARIABLES
      : kind.startsWith('treatment_plan.')
        ? TREATMENT_VARIABLES
        : RECOVERY_VARIABLES;
    return Array.from(supported).sort();
  }
}
