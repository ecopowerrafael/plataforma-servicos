export const COLLECTION_ACTIONS = [
  { actionId: 'COLLECTION_PAY_FULL', label: 'Pagar valor total' },
  { actionId: 'COLLECTION_NEED_MORE_TIME', label: 'Preciso de mais prazo' },
  { actionId: 'COLLECTION_PROMISE_1D', label: 'Amanhã' },
  { actionId: 'COLLECTION_PROMISE_3D', label: 'Em 3 dias' },
  { actionId: 'COLLECTION_PROMISE_7D', label: 'Em 7 dias' },
  { actionId: 'COLLECTION_PROMISE_10D', label: 'Em 10 dias' },
  { actionId: 'COLLECTION_PROMISE_CUSTOM_DATE', label: 'Outra data' },
  { actionId: 'COLLECTION_PAYMENT_STATUS', label: 'Ver status do pagamento' },
  { actionId: 'COLLECTION_DISPUTE', label: 'Não reconheço esta cobrança' },
  { actionId: 'COLLECTION_HUMAN_SUPPORT', label: 'Falar com atendimento' },
] as const;

export type CollectionActionId = (typeof COLLECTION_ACTIONS)[number]['actionId'];

export function isCollectionAction(actionId: string): actionId is CollectionActionId {
  return COLLECTION_ACTIONS.some((action) => action.actionId === actionId);
}
