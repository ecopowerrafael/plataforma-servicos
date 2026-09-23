/**
 * Regras puras do assistente de WhatsApp: menu, saudação e validade da sessão.
 * Sem acesso a banco nem ao provedor, para poder ser testado direto.
 */

/** Ações do menu principal. A ordem também define o índice usado na resposta. */
export const MAIN_MENU_ACTIONS = [
  { actionId: 'MAIN_MENU_BOOK', label: 'Agendar horário' },
  { actionId: 'MAIN_MENU_TREATMENTS', label: 'Meus tratamentos' },
  { actionId: 'MAIN_MENU_QUERY', label: 'Consultar agendamento' },
  { actionId: 'MAIN_MENU_RESCHEDULE', label: 'Reagendar' },
  { actionId: 'MAIN_MENU_CANCEL', label: 'Cancelar agendamento' },
  { actionId: 'MAIN_MENU_OTHER', label: 'Outros assuntos' },
] as const;

export type MainMenuActionId = (typeof MAIN_MENU_ACTIONS)[number]['actionId'];

export const BOOKING_ACTIONS = [
  { actionId: 'BOOKING_CONFIRM', label: 'Confirmar presença' },
  { actionId: 'BOOKING_RESCHEDULE', label: 'Reagendar' },
  { actionId: 'BOOKING_CANCEL', label: 'Cancelar' },
  { actionId: 'BOOKING_DIRECTIONS', label: 'Como chegar' },
  { actionId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' },
] as const;

export const TREATMENT_ACTIONS = [
  { actionId: 'TREATMENT_APPROVE', label: 'Aprovar orçamento' },
  { actionId: 'TREATMENT_SCHEDULE_FIRST', label: 'Agendar primeira sessão' },
  { actionId: 'TREATMENT_SCHEDULE_NEXT', label: 'Agendar próxima sessão' },
  { actionId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' },
] as const;

export type TreatmentActionId = (typeof TREATMENT_ACTIONS)[number]['actionId'];

/** Inatividade que encerra a sessão. Calculado na próxima mensagem, sem cron. */
export const CONVERSATION_TIMEOUT_MINUTES = 30;

export function conversationExpiresAt(from: Date) {
  return new Date(from.getTime() + CONVERSATION_TIMEOUT_MINUTES * 60_000);
}

/**
 * Uma conversa continua válida enquanto estiver ativa e dentro da janela.
 * Encerrada ou expirada, a próxima mensagem abre uma sessão nova.
 */
export function conversationIsUsable(
  conversation: { status: string; expiresAt: Date } | null,
  now: Date,
) {
  if (conversation === null) return false;
  if (conversation.status === 'CLOSED') return false;
  return conversation.expiresAt.getTime() > now.getTime();
}

export const firstNameOf = (name: string | null): string | null => {
  const trimmed = name?.trim() ?? '';
  if (trimmed === '') return null;
  return trimmed.split(/\s+/u)[0] ?? null;
};

/** Saudação em nome do estabelecimento — a marca do Agendei não aparece. */
export function greetingMessage(businessName: string, customerName: string | null) {
  const firstName = firstNameOf(customerName);
  return firstName === null
    ? `Olá! 👋\nBem-vindo à ${businessName}.\nComo posso ajudar?`
    : `Olá, ${firstName}! 👋\nBem-vindo novamente à ${businessName}.\nComo posso ajudar?`;
}

export const MENU_PROMPT = 'Escolha uma das opções abaixo para continuar.';
export const FALLBACK_PROMPT = 'Escolha uma das opções abaixo para continuar.';
