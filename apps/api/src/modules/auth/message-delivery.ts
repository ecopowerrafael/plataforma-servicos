export interface AccountMessage {
  recipient: string;
  kind: 'PASSWORD_RESET' | 'INVITATION';
  actionUrl: string;
  expiresAt: Date;
}

export interface AccountMessageDelivery {
  readonly available: boolean;
  deliver(message: AccountMessage): Promise<void>;
}

export class UnconfiguredAccountMessageDelivery implements AccountMessageDelivery {
  public readonly available = false;

  public deliver(): Promise<void> {
    return Promise.reject(new Error('O transportador de mensagens da conta não está configurado.'));
  }
}

export class CapturingAccountMessageDelivery implements AccountMessageDelivery {
  public readonly available = true;
  public readonly messages: AccountMessage[] = [];

  public deliver(message: AccountMessage): Promise<void> {
    this.messages.push(structuredClone(message));
    return Promise.resolve();
  }
}
