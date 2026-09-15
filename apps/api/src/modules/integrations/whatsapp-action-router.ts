import { FALLBACK_PROMPT, type MainMenuActionId } from './whatsapp-assistant.js';

/**
 * Roteador central de ações. Nesta etapa ele apenas reconhece as opções do
 * menu principal e responde — nenhuma funcionalidade real é executada.
 */
export interface RouterOutcome {
  reply: string;
  /** Reenviar o menu junto da resposta. */
  resendMenu: boolean;
  /** Novo status da conversa, quando a ação muda o modo de atendimento. */
  nextStatus: 'ACTIVE' | 'HUMAN_SUPPORT';
}

// Textos temporários: as funcionalidades chegam nas próximas etapas.
const PENDING: Record<MainMenuActionId, string> = {
  MAIN_MENU_BOOK: 'Agendamento pelo WhatsApp será disponibilizado nesta próxima etapa.',
  MAIN_MENU_TREATMENTS: 'Consultando seus tratamentos...',
  MAIN_MENU_QUERY: 'Consulta de agendamentos será disponibilizada na próxima etapa.',
  MAIN_MENU_RESCHEDULE: 'Reagendamento será disponibilizado na próxima etapa.',
  MAIN_MENU_CANCEL: 'Cancelamento será disponibilizado na próxima etapa.',
  MAIN_MENU_OTHER:
    'Certo. Escreva sua mensagem e o estabelecimento poderá continuar o atendimento.',
};

const isMainMenuAction = (value: string): value is MainMenuActionId => value in PENDING;

/**
 * Resolve o que responder. `actionId` vem do clique já traduzido para o nosso
 * vocabulário; texto livre cai no reenvio do menu.
 */
export function routeAction(actionId: string | null): RouterOutcome {
  if (actionId === null || !isMainMenuAction(actionId))
    return { reply: FALLBACK_PROMPT, resendMenu: true, nextStatus: 'ACTIVE' };
  if (actionId === 'MAIN_MENU_OTHER')
    return { reply: PENDING.MAIN_MENU_OTHER, resendMenu: false, nextStatus: 'HUMAN_SUPPORT' };
  return { reply: PENDING[actionId], resendMenu: false, nextStatus: 'ACTIVE' };
}
