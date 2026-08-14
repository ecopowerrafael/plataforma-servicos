import {
  type EmailDelivery,
  type EmailMessage,
  SmtpEmailDelivery,
  type SmtpEmailDeliveryOptions,
  UnconfiguredEmailDelivery,
} from './email-delivery.js';

export interface HostingerMailApiDeliveryOptions {
  /** Token Bearer da Mail API da Hostinger (env `HOSTINGER_MAIL_API_TOKEN`). */
  token: string;
  /** Endereço da caixa gerenciada que envia as mensagens (env `MAIL_FROM`). */
  from: string;
  /** Nome exibido no remetente; opcional. */
  displayName?: string | undefined;
  /** Atalho para pular a descoberta da caixa em `/api/v1/me`. */
  mailboxResourceId?: string | undefined;
  /** Base da API; só muda em teste. */
  baseUrl?: string | undefined;
}

interface MailboxListResponse {
  data?: { mailboxes?: { resourceId?: string; address?: string }[] };
}

const DEFAULT_BASE_URL = 'https://api.mail.hostinger.com';

/**
 * Envio transacional pela Mail API oficial da Hostinger.
 *
 * Usa HTTP direto (`fetch` nativo) em vez do `hostinger-mail-api-sdk`: o SDK
 * arrasta `axios` e ~800 kB só para montar um POST, e o custo de import é
 * justamente o que derruba o cold start nesta hospedagem. Nada de rede
 * acontece antes do primeiro `send()` — o resourceId da caixa é descoberto sob
 * demanda e memorizado.
 *
 * POST /api/v1/mailboxes/{mailboxResourceId}/send  → 204
 */
export class HostingerMailApiDelivery implements EmailDelivery {
  public readonly available = true;
  private mailbox: Promise<string> | undefined;

  public constructor(private readonly options: HostingerMailApiDeliveryOptions) {}

  private get baseUrl(): string {
    return (this.options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, '');
  }

  private async request(path: string, init: RequestInit & { body?: string }): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        // O token só existe aqui: nunca é logado nem devolvido em erros.
        authorization: `Bearer ${this.options.token}`,
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
    });
  }

  /** Descreve a falha sem jamais expor o token nem o corpo enviado. */
  private async failure(response: Response, action: string): Promise<Error> {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      detail = [body.code, body.error].filter((part) => typeof part === 'string').join(': ');
    } catch {
      detail = '';
    }
    return new Error(
      `Hostinger Mail API falhou ao ${action} (HTTP ${String(response.status)})${
        detail === '' ? '' : `: ${detail}`
      }`,
    );
  }

  private resolveMailbox(): Promise<string> {
    this.mailbox ??= (async () => {
      const configured = this.options.mailboxResourceId;
      if (configured !== undefined && configured !== '') return configured;

      const response = await this.request('/api/v1/me', { method: 'GET' });
      if (!response.ok) throw await this.failure(response, 'identificar a caixa de e-mail');

      const payload = (await response.json()) as MailboxListResponse;
      const wanted = this.options.from.trim().toLowerCase();
      const mailboxes = payload.data?.mailboxes ?? [];
      const match =
        mailboxes.find((mailbox) => mailbox.address?.trim().toLowerCase() === wanted) ??
        (mailboxes.length === 1 ? mailboxes[0] : undefined);
      if (match?.resourceId === undefined)
        throw new Error(
          `A caixa ${this.options.from} não está disponível para o token da Hostinger Mail API.`,
        );
      return match.resourceId;
    })().catch((error: unknown) => {
      // Uma falha pontual não pode congelar a configuração para sempre.
      this.mailbox = undefined;
      throw error;
    });
    return this.mailbox;
  }

  public async send(message: EmailMessage): Promise<void> {
    const mailbox = await this.resolveMailbox();
    const response = await this.request(
      `/api/v1/mailboxes/${encodeURIComponent(mailbox)}/send`,
      {
        method: 'POST',
        body: JSON.stringify({
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(this.options.displayName === undefined
            ? {}
            : { displayName: this.options.displayName }),
        }),
      },
    );
    if (!response.ok) throw await this.failure(response, 'enviar a mensagem');
  }
}

/**
 * Ordem de resolução do transporte de e-mail: Mail API da Hostinger, depois
 * SMTP, depois a implementação inerte. Nenhuma delas toca a rede aqui — tudo
 * acontece no primeiro `send()`.
 */
export function resolveEmailDelivery(options: {
  hostingerMail?: HostingerMailApiDeliveryOptions | undefined;
  smtp?: SmtpEmailDeliveryOptions | undefined;
}): EmailDelivery {
  if (options.hostingerMail !== undefined) return new HostingerMailApiDelivery(options.hostingerMail);
  if (options.smtp !== undefined) return new SmtpEmailDelivery(options.smtp);
  return new UnconfiguredEmailDelivery();
}
