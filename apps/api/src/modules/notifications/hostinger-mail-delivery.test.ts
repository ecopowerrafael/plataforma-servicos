import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SmtpEmailDelivery, UnconfiguredEmailDelivery } from './email-delivery.js';
import { HostingerMailApiDelivery, resolveEmailDelivery } from './hostinger-mail-delivery.js';

const source = readFileSync(new URL('./hostinger-mail-delivery.ts', import.meta.url), 'utf8');

const TOKEN = 'tok_super_secreto_123';

interface Recorded {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
}

interface Reply {
  status: number;
  body?: unknown;
}

let server: Server;
let baseUrl: string;
let requests: Recorded[] = [];
let replies: Map<string, Reply>;

beforeEach(async () => {
  requests = [];
  replies = new Map<string, Reply>([
    [
      'GET /api/v1/me',
      {
        status: 200,
        body: {
          data: {
            orderResourceId: 'ord_1',
            mailboxes: [
              { resourceId: 'mbx_outra', address: 'outra@agendei.site' },
              { resourceId: 'mbx_1', address: 'suporte@agendei.site' },
            ],
          },
        },
      },
    ],
    ['POST /api/v1/mailboxes/mbx_1/send', { status: 204 }],
  ]);

  server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      requests.push({
        method: request.method ?? '',
        url: request.url ?? '',
        authorization: request.headers.authorization,
        body,
      });
      const reply = replies.get(`${request.method ?? ''} ${request.url ?? ''}`) ?? { status: 404 };
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(reply.body === undefined ? '' : JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

function build(overrides: Record<string, unknown> = {}) {
  return new HostingerMailApiDelivery({
    token: TOKEN,
    from: 'suporte@agendei.site',
    baseUrl,
    ...overrides,
  });
}

const message = { to: 'cliente@exemplo.com', subject: 'Recuperação', text: 'Seu link' };

describe('resolveEmailDelivery', () => {
  const smtp = { host: 'smtp.exemplo.com', port: 587, secure: false, from: 'a@b.com' };
  const hostingerMail = { token: TOKEN, from: 'suporte@agendei.site' };

  it('prefere a Mail API da Hostinger quando há token', () => {
    expect(resolveEmailDelivery({ hostingerMail, smtp })).toBeInstanceOf(HostingerMailApiDelivery);
  });

  it('cai para SMTP quando só o SMTP está configurado', () => {
    expect(resolveEmailDelivery({ smtp })).toBeInstanceOf(SmtpEmailDelivery);
  });

  it('fica inerte quando nada está configurado', () => {
    const delivery = resolveEmailDelivery({});
    expect(delivery).toBeInstanceOf(UnconfiguredEmailDelivery);
    expect(delivery.available).toBe(false);
  });
});

describe('HostingerMailApiDelivery', () => {
  it('não carrega SDK nem HTTP client no startup', () => {
    // O único import do módulo é de tipos locais: nada entra no cold start.
    expect(source).not.toMatch(/from 'hostinger-mail-api-sdk'/u);
    expect(source).not.toMatch(/from 'axios'/u);
    // O módulo inteiro só importa o vizinho local; nenhum pacote externo.
    expect([...source.matchAll(/from '([^']+)';/gu)].map((match) => match[1])).toEqual([
      './email-delivery.js',
    ]);
  });

  it('não toca a rede no constructor', () => {
    const delivery = build();
    expect(delivery.available).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it('descobre a caixa e envia no primeiro send', async () => {
    await build().send(message);

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'GET /api/v1/me',
      'POST /api/v1/mailboxes/mbx_1/send',
    ]);
    expect(requests[0]?.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(requests[1]?.body ?? '{}')).toEqual({
      to: ['cliente@exemplo.com'],
      subject: 'Recuperação',
      text: 'Seu link',
    });
  });

  it('reutiliza a caixa resolvida no segundo envio', async () => {
    const delivery = build();
    await delivery.send(message);
    await delivery.send({ ...message, to: 'outro@exemplo.com' });

    expect(requests.filter((request) => request.url === '/api/v1/me')).toHaveLength(1);
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2);
  });

  it('dispensa a descoberta quando o mailbox vem configurado', async () => {
    await build({ mailboxResourceId: 'mbx_1' }).send(message);
    expect(requests.map((request) => request.url)).toEqual(['/api/v1/mailboxes/mbx_1/send']);
  });

  it('transforma erro da API em erro de delivery claro e sem credencial', async () => {
    replies.set('POST /api/v1/mailboxes/mbx_1/send', {
      status: 422,
      body: { error: 'Destinatário inválido', code: 'VALIDATION_FAILED' },
    });

    await expect(build({ mailboxResourceId: 'mbx_1' }).send(message)).rejects.toThrow(
      /Hostinger Mail API falhou ao enviar a mensagem \(HTTP 422\): VALIDATION_FAILED: Destinatário inválido/u,
    );

    const error: Error = await build({ mailboxResourceId: 'mbx_1' })
      .send(message)
      .then(() => new Error('deveria ter falhado'))
      .catch((reason: unknown) => reason as Error);
    expect(`${error.message}${error.stack ?? ''}`).not.toContain(TOKEN);
  });

  it('falha de forma explícita quando o token não gerencia a caixa', async () => {
    replies.set('GET /api/v1/me', {
      status: 200,
      body: {
        data: {
          mailboxes: [
            { resourceId: 'mbx_a', address: 'a@agendei.site' },
            { resourceId: 'mbx_b', address: 'b@agendei.site' },
          ],
        },
      },
    });

    await expect(build().send(message)).rejects.toThrow(/não está disponível para o token/u);
  });

  it('não memoriza uma descoberta que falhou', async () => {
    replies.set('GET /api/v1/me', { status: 401, body: { code: 'UNAUTHORIZED', error: 'Nope' } });
    const delivery = build();
    await expect(delivery.send(message)).rejects.toThrow(/HTTP 401/u);

    replies.set('GET /api/v1/me', {
      status: 200,
      body: { data: { mailboxes: [{ resourceId: 'mbx_1', address: 'suporte@agendei.site' }] } },
    });
    await expect(delivery.send(message)).resolves.toBeUndefined();
  });
});
