import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { registerStaticWeb } from './static-web.js';

let directory: string | undefined;

afterEach(async () => {
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

async function server() {
  directory = await mkdtemp(join(tmpdir(), 'agendei-static-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<main>Agendei</main>');
  await writeFile(join(directory, 'assets', 'PricingPage-12345678.js'), 'export {};');
  const app = Fastify();
  const fallback = await registerStaticWeb(app, directory);
  app.setNotFoundHandler((request, reply) => {
    if (fallback?.(request, reply) === true) return;
    return reply.code(404).send();
  });
  return app;
}

describe('static web delivery', () => {
  it('does not cache index, keeps hashed assets immutable and serves SPA refreshes', async () => {
    const app = await server();
    try {
      const [index, asset, spa] = await Promise.all([
        app.inject({ method: 'GET', url: '/' }),
        app.inject({ method: 'GET', url: '/assets/PricingPage-12345678.js' }),
        app.inject({ method: 'GET', url: '/planos', headers: { accept: 'text/html' } }),
      ]);
      expect(index.headers['cache-control']).toContain('no-store');
      expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(spa.statusCode).toBe(200);
      expect(spa.body).toContain('Agendei');
    } finally {
      await app.close();
    }
  });
});
