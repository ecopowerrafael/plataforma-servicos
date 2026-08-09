import {
  PushSubscriptionListResponseSchema,
  SuccessResponseSchema,
  VapidPublicKeyResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient, HttpError } from '../lib/http.js';

const SubscribePushResponseSchema = z.object({ publicId: z.uuid() });

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

type Support = 'unsupported' | 'default' | 'granted' | 'denied';

function currentSupport(): Support {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  )
    return 'unsupported';
  return Notification.permission;
}

export function CustomerPushNotifications({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [support, setSupport] = useState<Support>(currentSupport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vapid = useQuery({
    queryKey: ['public', 'push', 'vapid-public-key'],
    queryFn: () =>
      httpClient.request('/public/push/vapid-public-key', { schema: VapidPublicKeyResponseSchema }),
    retry: false,
  });

  const subscriptions = useQuery({
    queryKey: ['public', slug, 'customer', 'push', 'subscriptions'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/push/subscriptions`, {
        schema: PushSubscriptionListResponseSchema,
      }),
    enabled: support === 'granted',
    retry: false,
  });

  const subscribe = useMutation({
    mutationFn: async () => {
      setError(null);
      if (support === 'unsupported')
        throw new Error('Este navegador não suporta notificações push.');
      if (vapid.data?.publicKey === null || vapid.data?.publicKey === undefined)
        throw new Error('O estabelecimento ainda não configurou as notificações push.');

      const permission = await Notification.requestPermission();
      setSupport(permission);
      if (permission !== 'granted') {
        throw new Error(
          permission === 'denied'
            ? 'As notificações foram bloqueadas no navegador. Para ativar, altere a permissão nas configurações do site.'
            : 'É necessário permitir notificações para ativá-las.',
        );
      }

      const registration = await navigator.serviceWorker.register('/push-service-worker.js');
      const readyRegistration = await navigator.serviceWorker.ready.catch(() => registration);
      const subscription = await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.data.publicKey),
      });
      const json = subscription.toJSON();
      if (
        json.endpoint === undefined ||
        json.keys?.p256dh === undefined ||
        json.keys.auth === undefined
      )
        throw new Error('Não foi possível concluir a inscrição neste navegador.');

      await httpClient.request(`/public/sites/${slug}/customer/push/subscribe`, {
        method: 'POST',
        body: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent.slice(0, 255),
        },
        schema: SubscribePushResponseSchema,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['public', slug, 'customer', 'push', 'subscriptions'],
      });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível ativar.');
    },
  });

  const unsubscribe = useMutation({
    mutationFn: async () => {
      setError(null);
      const registration = await navigator.serviceWorker.getRegistration('/push-service-worker.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription !== null && subscription !== undefined) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await httpClient.request(`/public/sites/${slug}/customer/push/unsubscribe`, {
          method: 'POST',
          body: { endpoint },
          schema: SuccessResponseSchema,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['public', slug, 'customer', 'push', 'subscriptions'],
      });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof HttpError || mutationError instanceof Error
          ? mutationError.message
          : 'Não foi possível desativar.',
      );
    },
  });

  if (support === 'unsupported') {
    return (
      <section className="platform-form" aria-label="Notificações push">
        <h4>Notificações push</h4>
        <p>Este navegador não suporta notificações push.</p>
      </section>
    );
  }

  return (
    <section className="platform-form" aria-label="Notificações push">
      <h4>Notificações push</h4>
      {support === 'denied' && (
        <p className="form-error">
          As notificações estão bloqueadas para este site. Para ativá-las, altere a permissão de
          notificações do navegador para este site e recarregue a página.
        </p>
      )}
      {support === 'default' && (
        <p>
          Ative para receber avisos de confirmação, cancelamento e lembrete diretamente no
          navegador.
        </p>
      )}
      {support === 'granted' && (
        <p>
          {subscriptions.data === undefined
            ? 'Verificando dispositivos…'
            : subscriptions.data.items.length === 0
              ? 'Nenhum dispositivo ativo neste momento.'
              : `${String(subscriptions.data.items.length)} dispositivo(s) ativo(s).`}
        </p>
      )}
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {support !== 'denied' && (
          <button
            disabled={busy || subscribe.isPending}
            type="button"
            onClick={() => {
              setBusy(true);
              subscribe.mutate(undefined, {
                onSettled: () => {
                  setBusy(false);
                },
              });
            }}
          >
            {subscribe.isPending ? 'Ativando…' : 'Ativar notificações'}
          </button>
        )}
        {support === 'granted' && (
          <button
            disabled={busy || unsubscribe.isPending}
            type="button"
            onClick={() => {
              setBusy(true);
              unsubscribe.mutate(undefined, {
                onSettled: () => {
                  setBusy(false);
                },
              });
            }}
          >
            {unsubscribe.isPending ? 'Desativando…' : 'Desativar neste dispositivo'}
          </button>
        )}
      </div>
    </section>
  );
}
