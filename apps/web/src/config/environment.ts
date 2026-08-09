import { z } from 'zod';

const environmentSchema = z.object({
  VITE_API_URL: z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
});

const result = environmentSchema.safeParse(import.meta.env);

if (!result.success) {
  throw new Error('A configuração pública da aplicação é inválida.');
}

export const environment = Object.freeze({
  apiUrl: result.data.VITE_API_URL.replace(/\/$/u, ''),
});
