const eventLabels: Record<string, string> = {
  'platform.subscription.plan_changed': 'Plano alterado',
  'platform.subscription.activated': 'Assinatura ativada',
  'platform.subscription.reactivated': 'Assinatura reativada',
  'platform.subscription.suspended': 'Assinatura suspensa',
  'platform.subscription.trial_extended': 'Trial estendido',
  'platform.subscription.period_updated': 'Período corrigido',
  'platform.plan.deleted': 'Plano excluído',
  'platform.plan.deactivated': 'Plano desativado',
  'platform.tenant.created': 'Estabelecimento criado',
  'platform.commercial_policy.updated': 'Política comercial atualizada',
};

export function formatAuditEvent(action: string): string {
  const direct = eventLabels[action];
  if (direct) return direct;
  const readable = action.split('.').at(-1)?.replaceAll('_', ' ').trim() ?? action;
  return readable.length === 0 ? 'Evento administrativo' : readable.charAt(0).toUpperCase() + readable.slice(1);
}

const sensitive = /(?:password|passwd|secret|token|credential|authorization|smtp|api[_-]?key|access[_-]?token|refresh[_-]?token)/iu;
export function sanitizeAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditData);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key,item]) => [key, sensitive.test(key) ? '[protegido]' : sanitizeAuditData(item)]));
}
