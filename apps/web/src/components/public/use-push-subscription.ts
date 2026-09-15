import { VapidPublicKeyResponseSchema } from '@plataforma/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';

const SubscribePushResponseSchema = z.object({ publicId: z.uuid() });

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export function currentPushPermission(): PushPermission {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  )
    return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

/**
 * Assinatura de push do cliente. A permissão só é pedida dentro de
 * `subscribe.mutate()`, ou seja, sempre a partir de um clique — nunca no
 * carregamento da página. Compartilhado entre a conta do cliente e o convite
 * exibido após a confirmação do agendamento, para não haver duas
 * implementações de push.
 */
export function usePushSubscription(slug: string) {
  const [permission, setPermission] = useState<PushPermission>(currentPushPermission);
  const [error, setError] = useState<string | null>(null);

  const vapid = useQuery({
    queryKey: ['public', 'push', 'vapid-public-key'],
    queryFn: () =>
      httpClient.request('/public/push/vapid-public-key', { schema: VapidPublicKeyResponseSchema }),
    retry: false,
    enabled: permission !== 'unsupported',
  });

  const subscribe = useMutation({
    mutationFn: async () => {
      setError(null);
      if (permission === 'unsupported')
        throw new Error('Este navegador não suporta notificações push.');
      if (vapid.data?.publicKey === null || vapid.data?.publicKey === undefined)
        throw new Error('O estabelecimento ainda não configurou as notificações push.');

      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== 'granted')
        throw new Error(
          granted === 'denied'
            ? 'As notificações foram bloqueadas no navegador. Para ativar, altere a permissão nas configurações do site.'
            : 'É necessário permitir notificações para ativá-las.',
        );

      const registration = await navigator.serviceWorker.register('/push-service-worker.js');
      const ready = await navigator.serviceWorker.ready.catch(() => registration);
      const subscription = await ready.pushManager.subscribe({
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
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível ativar.');
    },
  });

  return { permission, setPermission, error, setError, subscribe, vapid };
}
