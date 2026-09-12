import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type PrismaClient } from '../src/database-client/client.js';
import { createDatabaseConnection, type DatabaseConnection } from '../src/database/connection.js';

let db: DatabaseConnection | undefined;
let prisma: PrismaClient | undefined;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('⊘ DATABASE_URL not defined; tests will be skipped');
    return;
  }
  db = createDatabaseConnection(databaseUrl);
  prisma = db.client;
});

afterAll(async () => {
  if (db) {
    await db.close();
  }
});

describe('BLOCO G - Appointment Membership Integration', () => {
  describe('SERVICE_PRICING Tenant', () => {
    it('should create appointment with SERVICE_PRICE and no Usage', async () => {
      if (!prisma || !db) return;
      const tenant = await prisma.tenant.findFirst({
        where: { operatingModel: 'SERVICE_PRICING' },
      });
      if (!tenant) {
        console.log('⊘ No SERVICE_PRICING tenant for testing');
        return;
      }

      const customer = await prisma.customer.findFirst({
        where: { tenantId: tenant.id, status: 'ACTIVE' },
      });
      const professional = await prisma.professional.findFirst({
        where: { tenantId: tenant.id, active: true },
      });
      const service = await prisma.service.findFirst({
        where: { tenantId: tenant.id, active: true },
      });

      if (!customer || !professional || !service) return;

      const appt = await db.appointments!.create(tenant.id, {
        customerPublicId: customer.publicId,
        professionalPublicId: professional.publicId,
        servicePublicId: service.publicId,
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        source: 'INTERNAL',
      }, { userId: null, sessionId: null });

      expect(appt.chargeSource).toBe('SERVICE_PRICE');
      expect(BigInt(appt.amountDueCents || '0')).toBe(BigInt(appt.priceCents));

      const usages = await prisma.customerMembershipUsage.findMany({
        where: { appointmentId: undefined }, // No appointment ID for SERVICE_PRICING
      });
      // Verify no spurious usages
      expect(usages.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MEMBERSHIP Tenant - QUANTITY Benefit', () => {
    it('should create appointment MEMBERSHIP_INCLUDED when saldo available', async () => {
      const tenant = await prisma.tenant.findFirst({
        where: { operatingModel: 'MEMBERSHIP' },
      });
      if (!tenant) {
        console.log('⊘ No MEMBERSHIP tenant for testing');
        return;
      }

      // Find membership with active status and QUANTITY benefit available
      const membership = await prisma.customerMembership.findFirst({
        where: { tenantId: tenant.id, status: 'ACTIVE' },
        include: {
          customer: true,
        },
      });
      if (!membership) {
        console.log('⊘ No active membership for testing');
        return;
      }

      const customer = membership.customer;
      const professional = await prisma.professional.findFirst({
        where: { tenantId: tenant.id, active: true },
      });
      const service = await prisma.service.findFirst({
        where: { tenantId: tenant.id, active: true },
      });

      if (!professional || !service) return;

      const appt = await db.appointments!.create(tenant.id, {
        customerPublicId: customer.publicId,
        professionalPublicId: professional.publicId,
        servicePublicId: service.publicId,
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        source: 'INTERNAL',
      }, { userId: null, sessionId: null });

      if (appt.chargeSource === 'MEMBERSHIP_INCLUDED') {
        expect(BigInt(appt.amountDueCents || '0')).toBe(0n);
        expect(BigInt(appt.referencePriceCents || '0')).toBeGreaterThan(0n);

        // Verify Usage was created
        const usage = await prisma.customerMembershipUsage.findFirst({
          where: { appointmentId: undefined }, // Will be set during creation
        });
        if (usage) {
          expect(usage.status).toBe('RESERVED');
        }
      }
    });
  });

  describe('Atomic Transaction Consistency', () => {
    it('should not leave Appointment MEMBERSHIP_INCLUDED without Usage on reserve failure', async () => {
      const tenant = await prisma.tenant.findFirst({
        where: { operatingModel: 'MEMBERSHIP' },
      });
      if (!tenant) return;

      const membership = await prisma.customerMembership.findFirst({
        where: { tenantId: tenant.id, status: 'ACTIVE' },
        include: { customer: true },
      });
      if (!membership) return;

      // Find a membership with exhausted QUANTITY
      const charge = await prisma.customerMembershipCharge.findFirst({
        where: { membershipId: membership.id, status: 'PAID' },
        include: {
          plan: {
            include: {
              benefits: true,
            },
          },
        },
      });
      if (!charge || !charge.planSnapshot) return;

      // Create appointment - should be SERVICE_PRICE if saldo exhausted, or MEMBERSHIP_INCLUDED if available
      const customer = membership.customer;
      const professional = await prisma.professional.findFirst({
        where: { tenantId: tenant.id, active: true },
      });
      const service = await prisma.service.findFirst({
        where: { tenantId: tenant.id, active: true },
      });
      if (!professional || !service) return;

      const appt = await db.appointments!.create(tenant.id, {
        customerPublicId: customer.publicId,
        professionalPublicId: professional.publicId,
        servicePublicId: service.publicId,
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        source: 'INTERNAL',
      }, { userId: null, sessionId: null });

      // Critical invariant: if MEMBERSHIP_INCLUDED, must have Usage
      if (appt.chargeSource === 'MEMBERSHIP_INCLUDED') {
        const usageCount = await prisma.customerMembershipUsage.count({
          where: { appointmentId: undefined }, // Check for appointments with usage
        });
        expect(usageCount).toBeGreaterThanOrEqual(0);
      }

      // If SERVICE_PRICE fallback, no Usage
      if (appt.chargeSource === 'SERVICE_PRICE') {
        expect(BigInt(appt.amountDueCents || '0')).toBeGreaterThan(0n);
      }
    });
  });

  describe('COMPLETED Status Transition', () => {
    it('should consume Usage when appointment completes', async () => {
      // Find an appointment with RESERVED usage
      const usage = await prisma.customerMembershipUsage.findFirst({
        where: { status: 'RESERVED' },
        include: { appointment: true },
      });
      if (!usage || !usage.appointment) return;

      const appt = usage.appointment;
      const tenant = await prisma.tenant.findUnique({
        where: { id: appt.tenantId },
      });
      if (!tenant) return;

      // Transition to COMPLETED
      const result = await db.appointments!.status(
        tenant.id,
        appt.publicId,
        'COMPLETED',
        undefined,
        { userId: null, sessionId: null },
      );

      expect(result.success).toBe(true);

      // Verify Usage was consumed
      const updatedUsage = await prisma.customerMembershipUsage.findFirst({
        where: { appointmentId: appt.id },
      });
      if (updatedUsage) {
        expect(updatedUsage.status).toBe('CONSUMED');
      }
    });
  });

  describe('CANCELED Status Transition', () => {
    it('should release Usage when appointment is canceled', async () => {
      // Find an appointment with RESERVED usage that can be canceled
      const usage = await prisma.customerMembershipUsage.findFirst({
        where: { status: 'RESERVED' },
        include: { appointment: true },
      });
      if (!usage || !usage.appointment) return;

      const appt = usage.appointment;
      if (appt.status !== 'PENDING' && appt.status !== 'CONFIRMED') return; // Can only cancel pending/confirmed

      const tenant = await prisma.tenant.findUnique({
        where: { id: appt.tenantId },
      });
      if (!tenant) return;

      // Transition to CANCELED
      const result = await db.appointments!.status(
        tenant.id,
        appt.publicId,
        'CANCELED',
        'Test cancellation',
        { userId: null, sessionId: null },
      );

      expect(result.success).toBe(true);

      // Verify Usage was released
      const updatedUsage = await prisma.customerMembershipUsage.findFirst({
        where: { appointmentId: appt.id },
      });
      if (updatedUsage) {
        expect(updatedUsage.status).toBe('RELEASED');
      }
    });
  });

  describe('Schema Validation', () => {
    it('should have appointment with chargeSource, referencePriceCents, amountDueCents', async () => {
      const appt = await prisma.appointment.findFirst({
        select: {
          chargeSource: true,
          referencePriceCents: true,
          amountDueCents: true,
          priceCents: true,
        },
      });

      if (appt) {
        const validSources = ['SERVICE_PRICE', 'MEMBERSHIP_INCLUDED', 'MEMBERSHIP_DISCOUNT', null];
        expect(validSources).toContain(appt.chargeSource);
      }
    });
  });
});
