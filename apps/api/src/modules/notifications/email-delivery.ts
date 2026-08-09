import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
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

export class SmtpEmailDelivery implements EmailDelivery {
  public readonly available = true;
  private readonly transport: Transporter;
  private readonly from: string;

  public constructor(options: SmtpEmailDeliveryOptions) {
    this.transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth:
        options.user === undefined || options.pass === undefined
          ? undefined
          : { user: options.user, pass: options.pass },
    });
    this.from = options.from;
  }

  public async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
