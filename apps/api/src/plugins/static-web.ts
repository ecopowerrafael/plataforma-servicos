import { access } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import fastifyStatic from '@fastify/static';
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

/**
 * Serve o frontend Vite já compilado (`apps/web/dist`), com fallback SPA:
 * qualquer navegação do lado do cliente (GET/HEAD que aceita `text/html` e não
 * corresponde a um arquivo real nem a uma rota da API) recebe o `index.html`,
 * deixando o React Router resolver a rota. Chamadas da API continuam retornando
 * JSON — o cliente HTTP envia `Accept: application/json`, então nunca casam com
 * o fallback.
 *
 * O diretório pode ser informado por `WEB_DIST_DIR` (absoluto ou relativo ao
 * diretório de trabalho). Quando não informado, tentamos localizar o `dist`
 * automaticamente por candidatos **independentes do diretório de trabalho**
 * (relativo ao cwd e relativo ao próprio módulo compilado), para funcionar
 * mesmo que a hospedagem inicie o processo a partir de `apps/api` ou da raiz.
 */
export function resolveWebDistDir(webDistDir: string): string {
  return isAbsolute(webDistDir) ? webDistDir : resolve(process.cwd(), webDistDir);
}

async function directoryHasIndex(candidate: string): Promise<boolean> {
  try {
    await access(join(candidate, 'index.html'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Candidatos padrão quando `WEB_DIST_DIR` não é informado. O módulo compilado
 * fica em `apps/api/dist/plugins/static-web.js`, então `../../../web/dist`
 * aponta para `apps/web/dist` na árvore do projeto, independentemente do cwd.
 */
function defaultCandidates(): string[] {
  return [
    resolve(process.cwd(), 'apps/web/dist'),
    resolve(import.meta.dirname, '../../../web/dist'),
  ];
}

export async function registerStaticWeb(
  app: FastifyInstance,
  webDistDir?: string,
): Promise<((request: FastifyRequest, reply: FastifyReply) => boolean) | undefined> {
  const candidates =
    webDistDir === undefined || webDistDir.trim().length === 0
      ? defaultCandidates()
      : [resolveWebDistDir(webDistDir)];

  let root: string | undefined;
  for (const candidate of candidates) {
    if (await directoryHasIndex(candidate)) {
      root = candidate;
      break;
    }
  }

  if (root === undefined) {
    app.log.warn(
      { candidates },
      'Frontend compilado (index.html) não encontrado; a API não servirá o site. Verifique WEB_DIST_DIR / o build de apps/web.',
    );
    return undefined;
  }

  app.log.info({ webDist: root }, 'Servindo o frontend compilado a partir deste diretório.');

  await app.register(fastifyStatic, {
    root,
    // wildcard:false registra uma rota por arquivo existente e NÃO cria um
    // catch-all `/*`, preservando o notFoundHandler para o fallback SPA.
    wildcard: false,
    index: ['index.html'],
    cacheControl: false,
    // Assets versionados pelo Vite (hash no nome) podem ter cache longo; o
    // index.html precisa revalidar para que novos deploys sejam vistos.
    setHeaders(reply, path) {
      if (path.endsWith('index.html')) {
        reply.setHeader('cache-control', 'no-store, max-age=0, must-revalidate');
      } else if (
        /[/\\]assets[/\\].+[-.][a-zA-Z0-9_-]{8,}\.(?:js|css|svg|png|webp|woff2?)$/u.test(path)
      ) {
        reply.setHeader('cache-control', 'public, max-age=31536000, immutable');
      } else {
        reply.setHeader('cache-control', 'public, max-age=300');
      }
    },
  });

  const prerenderedCommercialRoutes = new Set([
    '/',
    '/aplicativo-de-agendamento',
    '/agendamento-pelo-whatsapp',
    '/chatbot-whatsapp-para-agendamento',
    '/assistente-virtual-para-agendamento',
    '/agenda-online',
    '/sistema-de-agendamento-online',
    '/lembrete-de-agendamento-whatsapp',
    '/sistema-de-agendamento',
    '/ia-para-agendamento',
    '/sistema-para-salao-de-beleza',
    '/crm-para-salao-de-beleza',
    '/aplicativo-para-salao-de-beleza',
    '/agenda-online-para-salao-de-beleza',
    '/aplicativo-para-cabeleireiro',
    '/sistema-de-agendamento-para-cabeleireiro',
    '/sistema-de-comissao-para-salao',
    '/controle-financeiro-para-salao-de-beleza',
    '/programa-de-fidelidade-para-salao-de-beleza',
    '/recepcionista-virtual-para-salao-de-beleza',
    '/como-reduzir-faltas-no-salao', '/como-recuperar-clientes-de-salao', '/como-preencher-horarios-cancelados', '/como-organizar-agenda-de-salao', '/como-controlar-comissao-de-cabeleireiro', '/como-automatizar-agendamento-pelo-whatsapp', '/sistema-para-recuperar-clientes', '/sistema-para-preencher-horarios-cancelados',
    '/sistema-para-barbearia', '/aplicativo-para-barbearia', '/crm-para-barbearia', '/agenda-online-para-barbearia', '/ia-para-barbearia', '/whatsapp-para-barbearia', '/controle-financeiro-para-barbearia', '/programa-de-fidelidade-para-barbearia',
    '/sistema-para-clinica-de-estetica', '/crm-para-clinica-de-estetica', '/agendamento-para-estetica', '/aplicativo-para-estetica', '/sistema-para-tratamentos-esteticos', '/sistema-para-sessoes-de-estetica', '/orcamento-para-clinica-de-estetica', '/controle-de-retorno-de-clientes',
  ]);

  // As telas administrativas e a API compartilham o prefixo `/platform`.
  // NavegaÃ§Ãµes do browser pedem HTML; chamadas do cliente HTTP pedem JSON.
  // Interceptar o HTML antes do roteamento evita que refresh/deep-link de
  // `/platform/plans`, `/platform/tenants`, etc. seja tratado pelo endpoint
  // JSON homÃ´nimo.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?', 1)[0] ?? request.url;
    const accept = request.headers.accept ?? '';
    if (
      request.method === 'GET' &&
      (path === '/platform' || path.startsWith('/platform/')) &&
      accept.includes('text/html')
    ) {
      return reply.status(200).type('text/html').sendFile('index.html');
    }
  });

  return (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return false;
    }
    const accept = request.headers.accept ?? '';
    if (!accept.includes('text/html')) {
      return false;
    }
    const path = request.url.split('?', 1)[0] ?? request.url;
    if (prerenderedCommercialRoutes.has(path) && path !== '/') {
      void reply.status(200).type('text/html').sendFile(`${path.slice(1)}/index.html`);
      return true;
    }
    void reply.status(200).type('text/html').sendFile('index.html');
    return true;
  };
}
