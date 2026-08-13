import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SmtpEmailDelivery } from './email-delivery.js';

const { createTransport, sendMail, verify } = vi.hoisted(() => {
  const send = vi.fn().mockResolvedValue(undefined);
  const check = vi.fn().mockResolvedValue(true);
  return {
    sendMail: send,
    verify: check,
    createTransport: vi.fn(() => ({ sendMail: send, verify: check })),
  };
});

vi.mock('nodemailer', () => ({ default: { createTransport } }));

const source = readFileSync(new URL('./email-delivery.ts', import.meta.url), 'utf8');

const options = {
  host: 'smtp.exemplo.com',
  port: 465,
  secure: true,
  user: 'no-reply@exemplo.com',
  pass: 'segredo',
  from: 'AGENDEI <no-reply@exemplo.com>',
};

describe('SmtpEmailDelivery', () => {
  beforeEach(() => {
    createTransport.mockClear();
    sendMail.mockClear();
    verify.mockClear();
  });

  it('não importa o nodemailer no carregamento do módulo', () => {
    // O import estático entraria no cold start antes do listen; só o tipo pode
    // vir de forma estática.
    expect(source).toMatch(/^import type \{ Transporter \} from 'nodemailer';$/mu);
    expect(source).not.toMatch(/^import nodemailer/mu);
    expect(source).toMatch(/await import\('nodemailer'\)|import\('nodemailer'\)/u);
  });

  it('não cria o transporter no constructor', () => {
    const delivery = new SmtpEmailDelivery(options);
    expect(delivery.available).toBe(true);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('cria o transporter sob demanda no primeiro envio e o reutiliza', async () => {
    const delivery = new SmtpEmailDelivery(options);
    await delivery.send({ to: 'cliente@exemplo.com', subject: 'Olá', text: 'Mensagem' });
    expect(createTransport).toHaveBeenCalledOnce();
    expect(createTransport).toHaveBeenCalledWith({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: { user: options.user, pass: options.pass },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: options.from,
      to: 'cliente@exemplo.com',
      subject: 'Olá',
      text: 'Mensagem',
    });

    await delivery.send({ to: 'outro@exemplo.com', subject: 'Oi', text: 'Outra' });
    expect(createTransport).toHaveBeenCalledOnce();
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('nunca testa a conexão SMTP por conta própria', async () => {
    const delivery = new SmtpEmailDelivery(options);
    await delivery.send({ to: 'cliente@exemplo.com', subject: 'Olá', text: 'Mensagem' });
    expect(verify).not.toHaveBeenCalled();
    expect(source).not.toContain('.verify(');
  });

  it('omite a autenticação quando não há usuário e senha', async () => {
    const delivery = new SmtpEmailDelivery({ ...options, user: undefined, pass: undefined });
    await delivery.send({ to: 'cliente@exemplo.com', subject: 'Olá', text: 'Mensagem' });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });
});
