import webpush from 'web-push';

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  subscription: PushSubscriptionKeys;
  payload: string;
}

/** Sinaliza que o endpoint de push não é mais válido (404/410) e a inscrição deve ser desativada. */
export class PushSubscriptionGoneError extends Error {}

export interface PushDelivery {
  readonly available: boolean;
  send(message: PushMessage): Promise<void>;
}

export class UnconfiguredPushDelivery implements PushDelivery {
  public readonly available = false;

  public send(): Promise<void> {
    return Promise.reject(new Error('O VAPID não está configurado para este ambiente.'));
  }
}

export class CapturingPushDelivery implements PushDelivery {
  public readonly available = true;
  public readonly messages: PushMessage[] = [];

  public send(message: PushMessage): Promise<void> {
    this.messages.push(structuredClone(message));
    return Promise.resolve();
  }
}

export interface WebPushDeliveryOptions {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function isGoneStatus(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    (error.statusCode === 404 || error.statusCode === 410)
  );
}

export class WebPushDelivery implements PushDelivery {
  public readonly available = true;

  public constructor(options: WebPushDeliveryOptions) {
    webpush.setVapidDetails(options.subject, options.publicKey, options.privateKey);
  }

  public async send(message: PushMessage): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint: message.subscription.endpoint,
          keys: { p256dh: message.subscription.p256dh, auth: message.subscription.auth },
        },
        message.payload,
      );
    } catch (error) {
      if (isGoneStatus(error))
        throw new PushSubscriptionGoneError('A inscrição push não é mais válida.');
      throw error;
    }
  }
}
