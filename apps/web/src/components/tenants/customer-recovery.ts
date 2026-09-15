import { type RecoveryRuleSchema } from '@plataforma/shared';
import { type z } from 'zod';

export type RecoveryRule = z.infer<typeof RecoveryRuleSchema>;

/** Nomes amigáveis na tela; os enums do domínio continuam intactos. */
export const RULE_LABELS: Record<RecoveryRule, string> = {
  INACTIVE: 'Cliente inativo',
  CANCELED_NO_REBOOK: 'Cancelou e não reagendou',
  NO_SHOW_NO_REBOOK: 'Não compareceu e não reagendou',
  POST_SERVICE_NO_RETURN: 'Pós-atendimento sem retorno',
  BIRTHDAY: 'Aniversário',
};

/** Descrição humana da régua, já com o prazo configurado pelo estabelecimento. */
export const ruleDescription = (rule: RecoveryRule, days: number): string => {
  const period = `${String(days)} dia${days === 1 ? '' : 's'}`;
  if (rule === 'INACTIVE') return `Após ${period} sem nenhum atendimento.`;
  if (rule === 'CANCELED_NO_REBOOK')
    return `Após ${period} de um cancelamento sem novo agendamento.`;
  if (rule === 'NO_SHOW_NO_REBOOK') return `Após ${period} de uma falta sem novo agendamento.`;
  if (rule === 'POST_SERVICE_NO_RETURN')
    return `Após ${period} do último atendimento concluído, sem retorno.`;
  return 'No dia do aniversário do cliente.';
};

/** O prazo em dias não se aplica ao aniversário. */
export const usesDays = (rule: RecoveryRule) => rule !== 'BIRTHDAY';

export const RULE_ORDER: RecoveryRule[] = [
  'INACTIVE',
  'POST_SERVICE_NO_RETURN',
  'CANCELED_NO_REBOOK',
  'NO_SHOW_NO_REBOOK',
  'BIRTHDAY',
];

export const EXECUTION_LABELS: Record<'SENT' | 'SKIPPED' | 'FAILED', string> = {
  SENT: 'Enviado',
  SKIPPED: 'Ignorado',
  FAILED: 'Falha',
};

export const EXECUTION_TONE: Record<'SENT' | 'SKIPPED' | 'FAILED', 'success' | 'muted' | 'danger'> =
  {
    SENT: 'success',
    SKIPPED: 'muted',
    FAILED: 'danger',
  };

export const formatShortDate = (iso: string | null) =>
  iso === null
    ? null
    : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('pt-BR'))
    .join('');

export const formatPhone = (phone: string) => {
  const digits = phone.replace(/\D/gu, '').replace(/^55/u, '');
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
};

export const whatsappLink = (phone: string) => {
  const digits = phone.replace(/\D/gu, '');
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
};

export const phoneLink = (phone: string) => `tel:${phone.replace(/[^\d+]/gu, '')}`;

/** Agrupa execuções por régua e dia, para o operador ler o que já foi disparado. */
export function groupExecutions<
  T extends { rule: RecoveryRule; createdAt: string; status: 'SENT' | 'SKIPPED' | 'FAILED' },
>(items: T[]) {
  const groups = new Map<
    string,
    {
      key: string;
      rule: RecoveryRule;
      at: string;
      total: number;
      sent: number;
      skipped: number;
      failed: number;
      items: T[];
    }
  >();
  for (const item of items) {
    const day = item.createdAt.slice(0, 10);
    const key = `${item.rule}-${day}`;
    const current = groups.get(key) ?? {
      key,
      rule: item.rule,
      at: item.createdAt,
      total: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      items: [] as T[],
    };
    current.total += 1;
    if (item.status === 'SENT') current.sent += 1;
    else if (item.status === 'SKIPPED') current.skipped += 1;
    else current.failed += 1;
    if (item.createdAt > current.at) current.at = item.createdAt;
    current.items.push(item);
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => right.at.localeCompare(left.at));
}
