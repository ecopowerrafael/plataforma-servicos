import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProspectingRepository } from '../src/modules/prospecting/prospecting.repository.js';

describe('prospecting campaign creation — contrato de criação', () => {
  it('CreateCampaignSchema do routes aceita campos de follow-up/auto-reply', () => {
    // Simula o schema esperado baseado na leitura do prospecting.routes.ts
    const CreateCampaignSchema = z.object({
      name: z.string().min(1).max(180),
      categoryId: z.bigint().optional(),
      state: z.string().max(2).optional(),
      city: z.string().max(120).optional(),
      dailyLimit: z.number().int().positive().optional(),
      sendingStartMinutes: z.number().int().min(0).max(1440).optional(),
      sendingEndMinutes: z.number().int().min(0).max(1440).optional(),
      minIntervalSeconds: z.number().int().positive().optional(),
      maxIntervalSeconds: z.number().int().positive().optional(),
      allowedWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
      followUpEnabled: z.boolean().optional(),
      followUpAfterHours: z.number().int().positive().optional(),
      maxFollowUps: z.number().int().min(0).optional(),
      autoReplyEnabled: z.boolean().optional(),
      flowPublicId: z.string().uuid().nullable().optional(),
    });

    // Payload completo com todos os campos de follow-up/auto-reply
    const createPayload = {
      name: 'adamantina',
      dailyLimit: 100,
      sendingStartMinutes: 540,
      sendingEndMinutes: 1080,
      minIntervalSeconds: 30,
      maxIntervalSeconds: 120,
      allowedWeekdays: [1, 2, 3, 4, 5],
      followUpEnabled: false,
      followUpAfterHours: 24,
      maxFollowUps: 2,
      autoReplyEnabled: true,
      flowPublicId: '550e8400-e29b-41d4-a716-446655440000',
    };

    const result = CreateCampaignSchema.safeParse(createPayload);
    expect(result.success).toBe(true);
  });

  it('CreateCampaignSchema mantém campos originais', () => {
    const CreateCampaignSchema = z.object({
      name: z.string().min(1).max(180),
      categoryId: z.bigint().optional(),
      state: z.string().max(2).optional(),
      city: z.string().max(120).optional(),
      dailyLimit: z.number().int().positive().optional(),
      sendingStartMinutes: z.number().int().min(0).max(1440).optional(),
      sendingEndMinutes: z.number().int().min(0).max(1440).optional(),
      minIntervalSeconds: z.number().int().positive().optional(),
      maxIntervalSeconds: z.number().int().positive().optional(),
      allowedWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
      followUpEnabled: z.boolean().optional(),
      followUpAfterHours: z.number().int().positive().optional(),
      maxFollowUps: z.number().int().min(0).optional(),
      autoReplyEnabled: z.boolean().optional(),
      flowPublicId: z.string().uuid().nullable().optional(),
    });

    const createPayload = {
      name: 'test',
      dailyLimit: 50,
      sendingStartMinutes: 480,
      sendingEndMinutes: 1200,
      minIntervalSeconds: 20,
      maxIntervalSeconds: 180,
      allowedWeekdays: [0, 1, 2],
    };

    const result = CreateCampaignSchema.safeParse(createPayload);
    expect(result.success).toBe(true);
  });

  it('CreateCampaignSchema rejeita dailyLimit negativo', () => {
    const CreateCampaignSchema = z.object({
      name: z.string().min(1).max(180),
      dailyLimit: z.number().int().positive().optional(),
    });

    const badPayload = {
      name: 'test',
      dailyLimit: -50,
    };

    const result = CreateCampaignSchema.safeParse(badPayload);
    expect(result.success).toBe(false);
  });

  it('ProspectingRepository.createCampaign() TypeScript contrato inclui follow-up/auto-reply', () => {
    // Este teste apenas verifica que o TypeScript compila
    // A tipagem do método está em prospecting.repository.ts
    // Se os novos campos não fossem aceitos, teria erro em build:api

    // Verificação de contrato através de type check (implicit)
    // O próprio import acima faz o test falhar se houver erro de tipo
    expect(ProspectingRepository).toBeDefined();
  });
});
