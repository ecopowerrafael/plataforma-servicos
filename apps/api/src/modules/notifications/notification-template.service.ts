import { randomUUID } from 'node:crypto';

import {
  NotificationKinds,
  NotificationTemplateListResponseSchema,
  type NotificationKindSchema,
  type UpdateNotificationTemplateRequestSchema,
} from '@plataforma/shared';
import { type z } from 'zod';

import { type PrismaClient } from '../../database-client/client.js';

export type NotificationKind = z.infer<typeof NotificationKindSchema>;
type UpdateInput = z.infer<typeof UpdateNotificationTemplateRequestSchema>;

interface TemplateContent {
  subject: string;
  body: string;
}

const DEFAULT_TEMPLATES: Record<NotificationKind, TemplateContent> = {
  'appointment.booking_confirmed': {
    subject: 'Agendamento confirmado — protocolo {{protocol}}',
    body: 'Olá, {{customerName}}!\n\nSeu agendamento foi confirmado.\n\nServiço: {{serviceName}}\nProfissional: {{professionalName}}\nData/hora: {{when}}\nProtocolo: {{protocol}}',
  },
  'appointment.booking_canceled': {
    subject: 'Agendamento cancelado — protocolo {{protocol}}',
    body: 'Olá, {{customerName}}!\n\nSeu agendamento foi cancelado.\n\nServiço: {{serviceName}}\nProfissional: {{professionalName}}\nData/hora: {{when}}\nProtocolo: {{protocol}}{{canceledReasonLine}}',
  },
  'appointment.reminder': {
    subject: 'Lembrete de atendimento — protocolo {{protocol}}',
    body: 'Olá, {{customerName}}!\n\nEste é um lembrete do seu atendimento agendado.\n\nServiço: {{serviceName}}\nProfissional: {{professionalName}}\nData/hora: {{when}}\nProtocolo: {{protocol}}',
  },
};

export function renderTemplate(
  template: TemplateContent,
  variables: Record<string, string>,
): TemplateContent {
  const substitute = (input: string) =>
    input.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? '');
  return { subject: substitute(template.subject), body: substitute(template.body) };
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
        return {
          kind,
          subject: custom?.subject ?? fallback.subject,
          body: custom?.body ?? fallback.body,
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
    const existing = await this.client.notificationTemplate.findFirst({
      where: { tenantId, kind },
      select: { id: true },
    });
    if (existing === null) {
      await this.client.notificationTemplate.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          kind,
          subject: input.subject,
          body: input.body,
        },
      });
      return;
    }
    await this.client.notificationTemplate.update({
      where: { id: existing.id },
      data: { subject: input.subject, body: input.body },
    });
  }

  public async render(
    tenantId: bigint,
    kind: NotificationKind,
    variables: Record<string, string>,
  ): Promise<TemplateContent> {
    const custom = await this.client.notificationTemplate.findFirst({ where: { tenantId, kind } });
    return renderTemplate(custom ?? DEFAULT_TEMPLATES[kind], variables);
  }
}
