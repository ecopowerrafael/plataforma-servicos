import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { z } from 'zod';

const publicEnvironmentSchema = z.object({
  VITE_API_URL: z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'VITE_API_URL deve usar HTTP ou HTTPS.',
  }),
});

export default defineConfig(({ mode }) => {
  const environmentDirectory = resolve(import.meta.dirname, '../..');
  const result = publicEnvironmentSchema.safeParse(loadEnv(mode, environmentDirectory, 'VITE_'));

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Configuração pública inválida: ${fields}.`);
  }

  const apiUrl = result.data.VITE_API_URL;

  return {
    plugins: [react()],
    envDir: environmentDirectory,
    server: {
      // Em produção a API e o site compartilham a origem. No desenvolvimento,
      // encaminhamos as rotas públicas servidas pela API para que manifest e
      // mídia fiquem na mesma origem da página, como no deploy.
      proxy: {
        '/public/sites': { target: apiUrl, changeOrigin: true },
        '/public/media': { target: apiUrl, changeOrigin: true },
        '/public/push': { target: apiUrl, changeOrigin: true },
      },
    },
    build: {
      sourcemap: false,
    },
  };
});
