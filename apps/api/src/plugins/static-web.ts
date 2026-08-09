import { access } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import fastifyStatic from '@fastify/static';
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

/**
 * Serve o frontend Vite já compilado a partir de um diretório configurável
 * (`WEB_DIST_DIR`), com fallback SPA: qualquer navegação do lado do cliente
 * (rota GET/HEAD que aceita `text/html` e não corresponde a um arquivo real
 * nem a uma rota da API) recebe o `index.html`, deixando o React Router
 * resolver a rota. Chamadas da API continuam retornando JSON — o cliente HTTP
 * envia `Accept: application/json`, então nunca casam com o fallback.
 *
 * É estritamente opt-in: quando `WEB_DIST_DIR` não está definido (ex.: em
 * desenvolvimento, com o Vite servindo o frontend à parte), nada é registrado
 * e o comportamento da API permanece idêntico ao anterior.
 */
export function resolveWebDistDir(webDistDir: string): string {
  return isAbsolute(webDistDir) ? webDistDir : resolve(process.cwd(), webDistDir);
}

export async function registerStaticWeb(
  app: FastifyInstance,
  webDistDir: string,
): Promise<(request: FastifyRequest, reply: FastifyReply) => boolean> {
  const root = resolveWebDistDir(webDistDir);
  const indexFile = join(root, 'index.html');
  await access(indexFile);

  await app.register(fastifyStatic, {
    root,
    // wildcard:false registra uma rota por arquivo existente e NÃO cria um
    // catch-all `/*`, preservando o notFoundHandler para o fallback SPA.
    wildcard: false,
    index: ['index.html'],
    // Assets versionados pelo Vite (hash no nome) podem ter cache longo; o
    // index.html precisa revalidar para que novos deploys sejam vistos.
    setHeaders(reply, path) {
      if (path.endsWith('index.html')) {
        reply.setHeader('cache-control', 'no-cache');
      }
    },
  });

  return (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return false;
    }
    const accept = request.headers.accept ?? '';
    if (!accept.includes('text/html')) {
      return false;
    }
    void reply.status(200).type('text/html').sendFile('index.html');
    return true;
  };
}
