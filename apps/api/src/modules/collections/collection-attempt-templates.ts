/**
 * Corpo determinístico das mensagens de cobrança da Fase 4 — sem editor de
 * template ainda, só os textos necessários para os tipos que a Fase 3 já
 * produz. Sem ameaça, negativação ou urgência falsa.
 */
export const COLLECTION_TEMPLATE_BODIES: Record<string, string> = {
  'collection.initial':
    'Olá, {{debtorName}}. Identificamos um valor pendente de {{amount}} com {{tenantName}}, vencido em {{dueDate}}. Podemos te ajudar a regularizar?',
  'collection.same_day_followup':
    'Olá, {{debtorName}}. Só reforçando: o valor de {{amount}} com {{tenantName}} segue em aberto. Como podemos ajudar?',
  'collection.next_day_followup':
    'Olá, {{debtorName}}. O valor de {{amount}} com {{tenantName}} continua em aberto. Podemos conversar sobre isso?',
  'collection.cycle_restart':
    'Olá, {{debtorName}}. O valor de {{amount}} com {{tenantName}} (vencido em {{dueDate}}) ainda não foi regularizado. Podemos te ajudar?',
};

/** Placeholders permitidos: debtorName, tenantName, amount, dueDate — resolvidos só no backend. */
export function renderCollectionMessage(
  templateKey: string,
  variables: Record<string, string>,
): string | null {
  const body = COLLECTION_TEMPLATE_BODIES[templateKey];
  if (body === undefined) return null;
  return body.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? '');
}

export function formatMoneyCents(cents: bigint): string {
  return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDueDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short' }).format(date);
}
