import {
  type CustomerRecoveryRepository,
  type RecoveryRule,
} from './customer-recovery.repository.js';
import { type CustomerNotificationDispatcher } from '../notifications/customer-notification-dispatcher.js';

type Customer = Awaited<ReturnType<CustomerRecoveryRepository['listCustomers']>>[number];
type RuleRecord = Awaited<ReturnType<CustomerRecoveryRepository['listActiveRules']>>[number];

const kindByRule = {
  INACTIVE: 'customer.recovery.inactive',
  CANCELED_NO_REBOOK: 'customer.recovery.canceled',
  NO_SHOW_NO_REBOOK: 'customer.recovery.no_show',
  POST_SERVICE_NO_RETURN: 'customer.recovery.post_service',
  BIRTHDAY: 'customer.recovery.birthday',
} as const;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
// Gera chave mês (YYYY-MM) para usar como periodKey em regra INACTIVE.
// Isso permite enviar notificação novamente a cada mês para cliente inativo.
// Comportamento intencional: cliente recebe mensagem de re-engajamento uma vez por mês.
function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}
export function birthdayMatches(
  date: Date | null,
  now: Date,
  timezone = 'America/Sao_Paulo',
): boolean {
  if (date === null) return false;
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  });
  const birthParts = formatter.formatToParts(date);
  const nowParts = formatter.formatToParts(now);
  const birthMonth = birthParts.find((p) => p.type === 'month')?.value;
  const birthDay = birthParts.find((p) => p.type === 'day')?.value;
  const nowMonth = nowParts.find((p) => p.type === 'month')?.value;
  const nowDay = nowParts.find((p) => p.type === 'day')?.value;
  return birthMonth === nowMonth && birthDay === nowDay;
}

export class CustomerRecoveryService {
  public constructor(
    private readonly repository: CustomerRecoveryRepository,
    private readonly dispatcher: CustomerNotificationDispatcher,
  ) {}

  public async list(tenantId: bigint) {
    await this.repository.ensureRules(tenantId);
    return this.repository.listRules(tenantId);
  }
  public executions(tenantId: bigint) {
    return this.repository.listExecutions(tenantId);
  }

  public async update(
    tenantId: bigint,
    rule: RecoveryRule,
    input: { active: boolean; days: number },
    actor: { userId: bigint; sessionId: bigint },
  ) {
    const item = await this.repository.upsertRule(tenantId, rule, input);
    await this.repository.audit({
      tenantId,
      ...actor,
      action: 'customer_recovery.updated',
      targetType: 'customer_recovery_rule',
      targetPublicId: item.publicId,
    });
    return item;
  }

  /**
   * Elegíveis de uma régua ou de todas, resolvidos em uma única leitura de clientes.
   * A regra de elegibilidade continua sendo exatamente a mesma do envio (`match`).
   */
  public async eligible(tenantId: bigint, rule?: RecoveryRule, now = new Date()) {
    const configured = (await this.list(tenantId)).filter(
      (item) => rule === undefined || item.rule === rule,
    );
    if (configured.length === 0) return { items: [], counts: {} };
    const customers = await this.repository.listCustomers(tenantId);
    const counts: Partial<Record<RecoveryRule, number>> = {};
    const items = configured.flatMap((current) =>
      customers.flatMap((customer) => {
        const match = this.match(customer, current, now);
        if (match === null) return [];
        counts[current.rule] = (counts[current.rule] ?? 0) + 1;
        const last = customer.appointments.find((item) => item.status === 'COMPLETED');
        const next = [...customer.appointments]
          .reverse()
          .find(
            (item) =>
              item.startsAt.getTime() >= now.getTime() &&
              ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(item.status),
          );
        return [
          {
            customerPublicId: customer.publicId,
            name: customer.name,
            rule: current.rule,
            referenceAt: match.referenceAt?.toISOString() ?? null,
            phone: customer.phone,
            daysSinceReference:
              match.referenceAt === null
                ? null
                : Math.max(
                    Math.floor((now.getTime() - match.referenceAt.getTime()) / 86_400_000),
                    0,
                  ),
            lastServiceName: last?.service.name ?? null,
            lastProfessionalName: last?.professional.publicName ?? null,
            nextAppointmentAt: next?.startsAt.toISOString() ?? null,
          },
        ];
      }),
    );
    return { items, counts };
  }

  public async run(now = new Date(), tenantId?: bigint): Promise<number> {
    let processed = 0;
    for (const rule of await this.repository.listActiveRules()) {
      if (tenantId !== undefined && rule.tenantId !== tenantId) continue;
      const customers = await this.repository.listCustomers(rule.tenantId);
      for (const customer of customers) {
        const match = this.match(customer, rule, now);
        if (match === null) continue;
        const execution = await this.repository.claim(
          rule.tenantId,
          rule.id,
          customer.id,
          match.periodKey,
        );
        if (execution === null) continue;
        processed += 1;
        try {
          const sent = await this.dispatcher.dispatch(
            rule.tenantId,
            customer.id,
            kindByRule[rule.rule],
            execution.publicId,
            {
              customerName: customer.name,
              referenceDate:
                match.referenceAt?.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) ?? '',
            },
            'customer_recovery',
          );
          await this.repository.finish(execution.publicId, sent ? 'SENT' : 'SKIPPED', null);
          await this.repository.audit({
            tenantId: rule.tenantId,
            action: 'customer_recovery.executed',
            targetType: 'customer_recovery_execution',
            targetPublicId: execution.publicId,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message.slice(0, 500) : 'Falha desconhecida';
          await this.repository.finish(execution.publicId, 'FAILED', message);
          await this.repository.audit({
            tenantId: rule.tenantId,
            action: 'customer_recovery.failed',
            targetType: 'customer_recovery_execution',
            targetPublicId: execution.publicId,
          });
        }
      }
    }
    return processed;
  }

  private match(
    customer: Customer,
    rule: RuleRecord,
    now: Date,
  ): { referenceAt: Date | null; periodKey: string } | null {
    // Elegível se possuir pelo menos um canal: email, push ativo ou whatsapp
    if (
      customer.email === null &&
      customer.pushSubscriptions.length === 0 &&
      customer.whatsapp === null
    )
      return null;
    if (rule.rule === 'BIRTHDAY')
      return birthdayMatches(customer.birthDate, now, 'America/Sao_Paulo')
        ? { referenceAt: customer.birthDate, periodKey: String(now.getUTCFullYear()) }
        : null;
    const cutoff = new Date(now.getTime() - rule.days * 86_400_000);
    const status =
      rule.rule === 'CANCELED_NO_REBOOK'
        ? 'CANCELED'
        : rule.rule === 'NO_SHOW_NO_REBOOK'
          ? 'NO_SHOW'
          : 'COMPLETED';
    const reference = customer.appointments.find(
      (item) => item.status === status && item.startsAt <= cutoff,
    );
    if (reference === undefined) return null;
    const rebooked = customer.appointments.some(
      (item) =>
        item.startsAt > reference.startsAt &&
        item.status !== 'CANCELED' &&
        item.status !== 'NO_SHOW',
    );
    if (rebooked) return null;
    return {
      referenceAt: reference.startsAt,
      periodKey:
        rule.rule === 'INACTIVE' ? monthKey(now) : `${rule.rule}:${dayKey(reference.startsAt)}`,
    };
  }
}
