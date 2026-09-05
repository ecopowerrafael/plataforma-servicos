/**
 * Corpo determinístico das mensagens de cobrança das Fases 4-5 — sem editor
 * de template ainda, só os textos necessários para os tipos que o motor e o
 * fluxo de promessa produzem. Sem ameaça, negativação ou urgência falsa.
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
  'collection.promise_due':
    'Olá, {{debtorName}}. Hoje é o dia combinado para regularizar o valor de {{amount}} com {{tenantName}}. Podemos contar com você?',
  'collection.promise_overdue':
    'Olá, {{debtorName}}. O valor combinado de {{amount}} com {{tenantName}} ainda não foi regularizado. Podemos te ajudar?',
  'collection.promise_confirmation': 'Combinado! Vamos te lembrar em {{dueDate}}.',
  'collection.need_more_time_options': 'Sem problema, {{debtorName}}. Para quando você consegue pagar?',
  'collection.pix_charge':
    'Aqui está o PIX para regularizar o valor de {{amount}} com {{tenantName}}. Copie o código abaixo e cole no app do seu banco:\n\n{{pixCode}}',
  'collection.debt_settled': 'Recebemos seu pagamento, {{debtorName}}! Sua dívida com {{tenantName}} está quitada. Obrigado!',
  'collection.debt_already_settled': 'Olá, {{debtorName}}. Já identificamos aqui que o valor com {{tenantName}} está regularizado — obrigado!',
  'collection.pix_unavailable': 'No momento não conseguimos gerar o PIX automaticamente. Nossa equipe vai entrar em contato para te ajudar.',
  'collection.partial_options': 'Quanto você consegue pagar agora?',
  'collection.partial_pix':
    'Perfeito. Gere o pagamento de {{amount}} pelo PIX abaixo:\n\n{{pixCode}}\n\nApós a confirmação do pagamento, seu saldo ficará em {{remainingAmount}}.',
  'collection.partial_received':
    'Recebemos seu pagamento de {{amount}}, {{debtorName}}! Seu saldo atual com {{tenantName}} é {{remainingAmount}}.',
  'collection.payment_pending': 'Seu PIX ainda está aguardando confirmação.',
  'collection.payment_status_open': 'Recebemos seu pagamento. Seu saldo atual é {{amount}}.',
  'collection.payment_status_paid': 'Pagamento confirmado. Sua pendência está quitada.',
};

/** Placeholders permitidos: debtorName, tenantName, amount, dueDate, pixCode, remainingAmount — resolvidos só no backend. */
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
