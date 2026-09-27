import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/database/connection.js';
import { type PrismaClient } from '../src/database-client/client.js';
import { ProspectingClaimRepository } from '../src/modules/prospecting/prospecting-claim.repository.js';
import { generateWorkerId } from '../src/modules/prospecting/prospecting-worker-id.js';

const databaseUrl = process.env.MYSQL_INTEGRATION_DATABASE_URL;

describe.skipIf(databaseUrl === undefined)('ProspectingWorker Concurrency Integration', () => {
  const url = databaseUrl ?? 'mysql://USER:PASSWORD@127.0.0.1:3306/plataforma_servicos';
  let client: PrismaClient;
  let campaignId: bigint;
  let leadId: bigint;
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    client = createPrismaClient(url);

    // Criar campaign
    const campaign = await client.prospectingCampaign.create({
      data: {
        publicId: randomUUID(),
        name: `Test Campaign ${suffix}`,
        status: 'RUNNING',
        dailyLimit: 100,
        sendingStartMinutes: 0,
        sendingEndMinutes: 1440,
        minIntervalSeconds: 10,
        maxIntervalSeconds: 30,
        allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    campaignId = campaign.id;

    // Criar lead
    const lead = await client.prospectingLead.create({
      data: {
        publicId: randomUUID(),
        campaignId,
        normalizedPhone: '5511999999999',
        status: 'PENDING',
        nameSnapshot: 'Test Lead',
        directoryBusinessId: 1n,
      },
    });
    leadId = lead.id;
  });

  afterAll(async () => {
    // Cleanup
    await client.prospectingMessage.deleteMany({ where: { campaignId } });
    await client.prospectingLead.deleteMany({ where: { campaignId } });
    await client.prospectingCampaign.deleteMany({ where: { id: campaignId } });
    await client.$disconnect();
  });

  describe('Lead Claim Atomicity', () => {
    it('only one worker succeeds in atomic claim', async () => {
      const claimRepo = new ProspectingClaimRepository(client);
      const workerA = generateWorkerId();
      const workerB = generateWorkerId();
      const lockTtl = 120;

      // Both workers try to claim simultaneously
      const [resultA, resultB] = await Promise.all([
        claimRepo.claimLead(leadId, workerA, lockTtl),
        claimRepo.claimLead(leadId, workerB, lockTtl),
      ]);

      // Exactly one should succeed
      const successCount = (resultA.claimed ? 1 : 0) + (resultB.claimed ? 1 : 0);
      expect(successCount).toBe(1);

      // Verify lock in database
      const locked = await client.prospectingLead.findUnique({ where: { id: leadId } });
      expect(locked?.processingWorkerId).toBeDefined();
      expect(locked?.processingExpiresAt).toBeDefined();
      expect(locked?.processingExpiresAt).toBeInstanceOf(Date);

      // Release lock
      if (resultA.claimed) {
        await claimRepo.releaseLead(leadId, workerA);
      } else {
        await claimRepo.releaseLead(leadId, workerB);
      }
    });

    it('lock prevents second worker until expired', async () => {
      const claimRepo = new ProspectingClaimRepository(client);
      const workerA = generateWorkerId();
      const workerB = generateWorkerId();
      const shortTtl = 1; // 1 second

      // Worker A claims
      const claimA = await claimRepo.claimLead(leadId, workerA, shortTtl);
      expect(claimA.claimed).toBe(true);

      // Worker B tries immediately (should fail)
      const claimBImmediate = await claimRepo.claimLead(leadId, workerB, shortTtl);
      expect(claimBImmediate.claimed).toBe(false);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Worker B tries again (should succeed)
      const claimBAfterExpiry = await claimRepo.claimLead(leadId, workerB, shortTtl);
      expect(claimBAfterExpiry.claimed).toBe(true);

      // Cleanup
      await claimRepo.releaseLead(leadId, workerB);
    });
  });

  describe('Campaign Rate Limit Atomicity', () => {
    it('only one lead from campaign can reserve send slot', async () => {
      // Create two leads in same campaign
      const lead2Id = (
        await client.prospectingLead.create({
          data: {
            publicId: randomUUID(),
            campaignId,
            normalizedPhone: '5511988888888',
            status: 'PENDING',
            nameSnapshot: 'Test Lead 2',
            directoryBusinessId: 1n,
          },
        })
      ).id;

      const now = new Date();
      const workerA = generateWorkerId();
      const workerB = generateWorkerId();
      const claimRepo = new ProspectingClaimRepository(client);

      // Both workers attempt to:
      // 1. Claim their respective lead
      // 2. Reserve campaign rate limit slot

      const claimAPromise = claimRepo.claimLead(leadId, workerA, 120);
      const claimBPromise = claimRepo.claimLead(lead2Id, workerB, 120);

      const [claimA, claimB] = await Promise.all([claimAPromise, claimBPromise]);
      expect(claimA.claimed).toBe(true);
      expect(claimB.claimed).toBe(true);

      // Now simulate atomic campaign rate-limit reservation
      // Only one should successfully update campaign.nextSendAt
      const reservedUntil = new Date(now.getTime() + 30_000);

      const updateA = await client.prospectingCampaign.updateMany({
        where: {
          id: campaignId,
          AND: [
            {
              OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }],
            },
          ],
        },
        data: { nextSendAt: reservedUntil },
      });

      const updateB = await client.prospectingCampaign.updateMany({
        where: {
          id: campaignId,
          AND: [
            {
              OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }],
            },
          ],
        },
        data: { nextSendAt: reservedUntil },
      });

      // Only first update should succeed (count=1)
      const totalUpdates = updateA.count + updateB.count;
      expect(totalUpdates).toBe(1);

      // Verify campaign has reserved slot
      const campaign = await client.prospectingCampaign.findUnique({ where: { id: campaignId } });
      expect(campaign?.nextSendAt).toEqual(reservedUntil);

      // Cleanup
      await claimRepo.releaseLead(leadId, workerA);
      await claimRepo.releaseLead(lead2Id, workerB);
      await client.prospectingLead.delete({ where: { id: lead2Id } });
      await client.prospectingCampaign.update({
        where: { id: campaignId },
        data: { nextSendAt: null },
      });
    });
  });

  describe('Idempotency via Unique Constraint', () => {
    it('unique(campaignId, idempotencyKey) prevents duplicate messages', async () => {
      const idempotencyKey = `${randomUUID()}:${randomUUID()}:0`;

      // First message creation
      const msg1 = await client.prospectingMessage.create({
        data: {
          publicId: randomUUID(),
          campaignId,
          leadId,
          direction: 'OUTBOUND',
          status: 'SENDING',
          idempotencyKey,
          body: 'Test message',
        },
      });

      expect(msg1).toBeDefined();

      // Try to create second message with same idempotency key
      try {
        await client.prospectingMessage.create({
          data: {
            publicId: randomUUID(),
            campaignId,
            leadId,
            direction: 'OUTBOUND',
            status: 'SENDING',
            idempotencyKey,
            body: 'Test message 2',
          },
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Expected: unique constraint violation
        expect(error.code).toBe('P2002');
      }

      // Cleanup
      await client.prospectingMessage.delete({ where: { id: msg1.id } });
    });
  });

  describe('Lock Expiration Recovery', () => {
    it('expired lock allows other worker to claim', async () => {
      const claimRepo = new ProspectingClaimRepository(client);
      const workerA = generateWorkerId();
      const workerB = generateWorkerId();

      // Worker A claims with very short TTL
      const claimA = await claimRepo.claimLead(leadId, workerA, 1);
      expect(claimA.claimed).toBe(true);

      // Verify lock is active
      const locked = await client.prospectingLead.findUnique({ where: { id: leadId } });
      expect(locked?.processingWorkerId).toBe(workerA);

      // Check if locked by other worker (should say yes)
      const isLockedByOther = await claimRepo.isLockedByOtherWorker(leadId, workerB, new Date());
      expect(isLockedByOther).toBe(true);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Now other worker should be able to claim
      const isStillLockedByOther = await claimRepo.isLockedByOtherWorker(
        leadId,
        workerB,
        new Date(),
      );
      expect(isStillLockedByOther).toBe(false);

      const claimB = await claimRepo.claimLead(leadId, workerB, 120);
      expect(claimB.claimed).toBe(true);

      // Cleanup
      await claimRepo.releaseLead(leadId, workerB);
    });
  });
});
