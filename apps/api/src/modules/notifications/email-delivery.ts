import type { Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string | undefined;
  fromName?: string | undefined;
}

export interface EmailDelivery {
  readonly available: boolean;
  send(message: EmailMessage): Promise<void>;
}

export class UnconfiguredEmailDelivery implements EmailDelivery {
  public readonly available = false;

  public send(): Promise<void> {
    return Promise.reject(new Error('O SMTP não está configurado para este ambiente.'));
  }
}

export class CapturingEmailDelivery implements EmailDelivery {
  public readonly available = true;
  public readonly messages: EmailMessage[] = [];

  public send(message: EmailMessage): Promise<void> {
    this.messages.push(structuredClone(message));
    return Promise.resolve();
  }
}

export interface SmtpEmailDeliveryOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  pass?: string | undefined;
  from: string;
}

/**
 * O `nodemailer` só é carregado no primeiro envio: importá-lo (e criar o
 * transporter) no início custava segundos de cold start, e o ambiente da
 * Hostinger derruba o processo se a porta não abrir em poucos segundos.
 * Nada de rede, DNS ou `verify()` acontece antes do primeiro `send()`.
 */
export class SmtpEmailDelivery implements EmailDelivery {
  public readonly available = true;
  private transport: Promise<Transporter> | undefined;

  public constructor(private readonly options: SmtpEmailDeliveryOptions) {}

  private transporter(): Promise<Transporter> {
    this.transport ??= import('nodemailer').then((nodemailer) =>
      nodemailer.default.createTransport({
        host: this.options.host,
        port: this.options.port,
        secure: this.options.secure,
        auth:
          this.options.user === undefined || this.options.pass === undefined
            ? undefined
            : { user: this.options.user, pass: this.options.pass },
      }),
    );
    return this.transport;
  }

  public async send(message: EmailMessage): Promise<void> {
    const transport = await this.transporter();
    await transport.sendMail({
      from:
        message.fromName === undefined
          ? this.options.from
          : { name: message.fromName, address: this.options.from },
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
    });
  }
}
