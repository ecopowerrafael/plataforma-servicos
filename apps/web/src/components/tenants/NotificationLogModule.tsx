import { NotificationListResponseSchema, SuccessResponseSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  SENT: 'Enviada',
  FAILED: 'Falhou',
  SKIPPED: 'Ignorada (SMTP não configurado)',
};

export function NotificationLogModule({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['tenant', tenantPublicId, 'notifications'],
    queryFn: () =>
      httpClient.request('/tenant/notifications', {
        schema: NotificationListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const retry = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/notifications/${publicId}/retry`, {
        method: 'POST',
        body: {},
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'notifications'] });
    },
  });

  return (
    <section className="platform-form" aria-label="Notificações">
      <h3>Notificações</h3>
      {notifications.isPending ? <p>Carregando…</p> : null}
      {notifications.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar o log de notificações.</p>
      ) : null}
      {retry.error instanceof Error ? (
        <p className="form-error">Não foi possível reenviar a notificação.</p>
      ) : null}
      {notifications.data !== undefined && (
        <ul>
          {notifications.data.items.map((item) => (
            <li key={item.publicId}>
              <strong>{item.subject}</strong> — {item.recipient} —{' '}
              {statusLabels[item.status] ?? item.status} (tentativas: {item.attempts})
              {item.status === 'FAILED' && (
                <button
                  disabled={retry.isPending}
                  onClick={() => {
                    retry.mutate(item.publicId);
                  }}
                >
                  Reenviar
                </button>
              )}
            </li>
          ))}
          {notifications.data.items.length === 0 && <li>Nenhuma notificação registrada.</li>}
        </ul>
      )}
    </section>
  );
}
