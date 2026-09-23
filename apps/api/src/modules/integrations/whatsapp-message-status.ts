import { type WhatsAppEventType } from './whatsapp-inbound.js';

/**
 * Ciclo de vida de uma mensagem enviada pelo Agendei.
 *
 * Não reaproveitamos `NotificationStatus` porque ele não tem DELIVERED nem
 * READ, e ampliá-lo mudaria o significado do enum para todos os canais.
 */
export type WhatsAppMessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

/** Ordem de avanço. FAILED fica fora: é lateral, não é o topo da escada. */
const rank: Record<WhatsAppMessageStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 0,
};

export function statusFromEvent(eventType: WhatsAppEventType): WhatsAppMessageStatus | null {
  switch (eventType) {
    case 'MESSAGE_SENT':
      return 'SENT';
    case 'MESSAGE_DELIVERED':
      return 'DELIVERED';
    case 'MESSAGE_READ':
      return 'READ';
    case 'MESSAGE_FAILED':
      return 'FAILED';
    default:
      return null;
  }
}

/**
 * Transição monotônica: um webhook repetido ou fora de ordem nunca faz o
 * estado regredir. Uma falha só é registrada enquanto a mensagem não avançou,
 * já que uma mensagem entregue não passa a ter falhado depois.
 */
export function advanceStatus(
  current: WhatsAppMessageStatus,
  next: WhatsAppMessageStatus,
): WhatsAppMessageStatus {
  if (current === 'FAILED') return next === 'FAILED' ? current : next;
  if (next === 'FAILED') return current === 'QUEUED' ? 'FAILED' : current;
  return rank[next] > rank[current] ? next : current;
}

/** Coluna de data correspondente ao status, para o carimbo do momento. */
export function timestampColumn(status: WhatsAppMessageStatus) {
  switch (status) {
    case 'SENT':
      return 'sentAt' as const;
    case 'DELIVERED':
      return 'deliveredAt' as const;
    case 'READ':
      return 'readAt' as const;
    case 'FAILED':
      return 'failedAt' as const;
    default:
      return null;
  }
}
