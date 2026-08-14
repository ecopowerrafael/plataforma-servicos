import { PushSubscriptionListResponseSchema, SuccessResponseSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconBell } from '@tabler/icons-react';

import { usePushSubscription } from './public/use-push-subscription.js';
import { httpClient, HttpError } from '../lib/http.js';

/**
 * Ativação de lembretes na conta do cliente. A permissão do navegador só é
 * pedida no clique (ver `usePushSubscription`), nunca no carregamento.
 */
export function CustomerPushNotifications({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const { permission, error, setError, subscribe } = usePushSubscription(slug);
  const subscriptionsKey = ['public', slug, 'customer', 'push', 'subscriptions'];

  const subscriptions = useQuery({
    queryKey: subscriptionsKey,
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/push/subscriptions`, {
        schema: PushSubscriptionListResponseSchema,
      }),
    enabled: permission === 'granted',
    retry: false,
  });

  const unsubscribe = useMutation({
    mutationFn: async () => {
      setError(null);
      const registration = await navigator.serviceWorker.getRegistration('/push-service-worker.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription !== null && subscription !== undefined) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await httpClient.request(`/public/sites/${slug}/customer/push/unsubscribe`, {
          method: 'POST',
          body: { endpoint },
          schema: SuccessResponseSchema,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionsKey });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof HttpError || mutationError instanceof Error
          ? mutationError.message
          : 'Não foi possível desativar.',
      );
    },
  });

  if (permission === 'unsupported') {
    return (
      <section className="customer-setting-card" aria-label="Notificações push">
        <IconBell className="customer-setting-icon" aria-hidden="true" />
        <h1>Notificações</h1>
        <h2>Receba lembretes dos seus horários</h2>
        <p>Este navegador não suporta notificações push.</p>
      </section>
    );
  }

  return (
    <section className="customer-setting-card" aria-label="Notificações push">
      <IconBell className="customer-setting-icon" aria-hidden="true" />
      <h1>Notificações</h1>
      <h2>Receba lembretes dos seus horários</h2>
      {permission === 'denied' && (
        <p className="form-error">
          As notificações estão bloqueadas para este site. Para ativá-las, altere a permissão de
          notificações do navegador para este site e recarregue a página.
        </p>
      )}
      {permission === 'default' && (
        <p>
          Ative para receber avisos de confirmação, cancelamento e lembrete diretamente no
          navegador.
        </p>
      )}
      {permission === 'granted' && (
        <p>
          {subscriptions.data === undefined
            ? 'Notificações ativadas. Verificando dispositivos…'
            : subscriptions.data.items.length === 0
              ? 'Notificações ativadas. Nenhum dispositivo ativo neste momento.'
              : `Notificações ativadas em ${String(subscriptions.data.items.length)} dispositivo(s).`}
        </p>
      )}
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {permission !== 'denied' && (
          <button
            disabled={subscribe.isPending}
            type="button"
            onClick={() => {
              subscribe.mutate(undefined, {
                onSuccess: () => {
                  void queryClient.invalidateQueries({ queryKey: subscriptionsKey });
                },
              });
            }}
          >
            {subscribe.isPending ? 'Ativando…' : 'Ativar notificações'}
          </button>
        )}
        {permission === 'granted' && (
          <button
            disabled={unsubscribe.isPending}
            type="button"
            onClick={() => {
              unsubscribe.mutate();
            }}
          >
            {unsubscribe.isPending ? 'Desativando…' : 'Desativar neste dispositivo'}
          </button>
        )}
      </div>
    </section>
  );
}
