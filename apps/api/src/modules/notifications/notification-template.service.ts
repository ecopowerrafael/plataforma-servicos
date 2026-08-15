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
]);
const RECOVERY_VARIABLES = new Set(['customerName', 'tenantName', 'referenceDate']);

function assertSupportedVariables(
  kind: NotificationKind,
  values: Array<string | null | undefined>,
) {
  const supported = kind.startsWith('appointment.') ? APPOINTMENT_VARIABLES : RECOVERY_VARIABLES;
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

const DEFAULT_WHATSAPP_TEMPLATES: Partial<Record<NotificationKind, string>> = {
  'appointment.booking_confirmed':
    'Ola, {{customerName}}! Seu agendamento de {{serviceName}}{{professionalPhrase}} foi confirmado para {{date}} as {{time}}.',
  'appointment.reminder':
    'Ola, {{customerName}}! Lembrete: seu agendamento de {{serviceName}}{{professionalPhrase}} e {{date}} as {{time}}.',
  'appointment.booking_canceled':
    'Ola, {{customerName}}. Seu agendamento de {{serviceName}} para {{date}} as {{time}} foi cancelado.',
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

  public async update(tenantId: bigint, kind: NotificationKind, input: UpdateInput): Promise<void> {
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
        },
      });
      return;
    }
    await this.client.notificationTemplate.update({
      where: { id: existing.id },
      data: {
        subject: input.subject,
        body: storedBody,
        ...(input.whatsappBody === undefined ? {} : { whatsappBody: input.whatsappBody }),
      },
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
  ): Promise<string> {
    const custom = await this.client.notificationTemplate.findFirst({ where: { tenantId, kind } });
    const template =
      custom?.whatsappBody ?? DEFAULT_WHATSAPP_TEMPLATES[kind] ?? DEFAULT_TEMPLATES[kind].body;
    const professional = variables.professionalName?.trim() ?? '';
    return renderTemplate(
      { subject: '', body: template },
      { ...variables, professionalPhrase: professional === '' ? '' : ` com ${professional}` },
    ).body;
  }
}
