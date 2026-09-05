import { IconBell } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';

import { usePushSubscription } from './use-push-subscription.js';

/**
 * Convite para ativar lembretes, exibido depois da confirmação do
 * agendamento. Só aparece quando a permissão ainda é `default` — nunca pede
 * permissão sozinho.
 */
export function PushReminderCta({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const { permission, error, subscribe } = usePushSubscription(slug);

  if (permission !== 'default') return null;

  return (
    <div className="push-reminder-cta">
      <IconBell size={18} aria-hidden="true" />
      <p>Quer receber lembretes do seu horário?</p>
      {error === null ? null : (
        <span className="booking-inline-error" role="alert">
          {error}
        </span>
      )}
      <button
        className="secondary-button"
        disabled={subscribe.isPending}
        type="button"
        onClick={() => {
          subscribe.mutate(undefined, {
            onSuccess: () => {
              void queryClient.invalidateQueries({
                queryKey: ['public', slug, 'customer', 'push', 'subscriptions'],
              });
            },
          });
        }}
      >
        {subscribe.isPending ? 'Ativando…' : 'Ativar notificações'}
      </button>
    </div>
  );
}
