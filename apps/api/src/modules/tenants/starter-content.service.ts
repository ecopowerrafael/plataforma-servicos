import { randomUUID } from 'node:crypto';

import { type BusinessProfileCode } from '@plataforma/shared';

import { PlanEntitlementService } from './plan-entitlement.service.js';
import {
  STARTER_WEEKDAYS,
  STARTER_WORKDAY,
  starterPresetFor,
} from './starter-content.presets.js';
import { type PrismaClient } from '../../database-client/client.js';

const SERVICE_COLOR = '#C79A5B';

interface StarterContentIds {
  [key: string]: string[] | string | null;
  serviceIds: string[];
  comboId: string | null;
  professionalId: string | null;
}

function storedIds(value: unknown): StarterContentIds | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<StarterContentIds>;
  if (!Array.isArray(raw.serviceIds)) return null;
  return {
    serviceIds: raw.serviceIds.filter((item): item is string => typeof item === 'string'),
    comboId: typeof raw.comboId === 'string' ? raw.comboId : null,
    professionalId: typeof raw.professionalId === 'string' ? raw.professionalId : null,
  };
}

/**
 * Só remove o que o próprio sistema gerou e que continua intocado: registro
 * ainda existente, sem edição (updatedAt == createdAt) e sem agendamento.
 * Qualquer sinal de uso ou edição preserva tudo.
 */
async function discardUntouchedStarterContent(
  transaction: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  tenantId: bigint,
  ids: StarterContentIds,
): Promise<boolean> {
  const untouched = (record: { createdAt: Date; updatedAt: Date }) =>
    record.updatedAt.getTime() - record.createdAt.getTime() < 1000;

  const services = await transaction.service.findMany({
    where: { tenantId, publicId: { in: ids.serviceIds } },
    select: { id: true, createdAt: true, updatedAt: true },
  });
  if (services.length !== ids.serviceIds.length || !services.every(untouched)) return false;

  const professional =
    ids.professionalId === null
      ? null
      : await transaction.professional.findFirst({
          where: { tenantId, publicId: ids.professionalId },
          select: { id: true, createdAt: true, updatedAt: true },
        });
  if (ids.professionalId !== null && (professional === null || !untouched(professional)))
    return false;

  const combo =
    ids.comboId === null
      ? null
      : await transaction.combo.findFirst({
          where: { tenantId, publicId: ids.comboId },
          select: { id: true, createdAt: true, updatedAt: true },
        });
  if (ids.comboId !== null && (combo === null || !untouched(combo))) return false;

  const serviceIds = services.map((service) => service.id);
  const appointments = await transaction.appointment.count({
    where: { tenantId, OR: [{ serviceId: { in: serviceIds } }, ...(professional === null ? [] : [{ professionalId: professional.id }])] },
  });
  if (appointments > 0) return false;

  if (combo !== null) {
    await transaction.comboItem.deleteMany({ where: { tenantId, comboId: combo.id } });
    await transaction.combo.delete({ where: { id: combo.id } });
  }
  if (professional !== null) {
    await transaction.professionalWorkSchedule.deleteMany({
      where: { tenantId, professionalId: professional.id },
    });
    await transaction.professionalService.deleteMany({
      where: { tenantId, professionalId: professional.id },
    });
    await transaction.professionalUnit.deleteMany({
      where: { tenantId, professionalId: professional.id },
    });
    await transaction.professional.delete({ where: { id: professional.id } });
  }
  await transaction.service.deleteMany({ where: { tenantId, id: { in: serviceIds } } });
  return true;
}

/**
 * Cria o conteúdo inicial de um tenant novo (serviços, combo, profissional,
 * vínculos e agenda) e liga o app público em PREMIUM_APP + LUXURY.
 *
 * Idempotente por `tenant.starterContentSeededAt`: a marca é gravada na mesma
 * transação, então recarregar a página ou repetir a requisição não duplica nada.
 * Tenants antigos têm a marca nula, mas só entram aqui se passarem pelo
 * onboarding novamente — por isso a checagem extra de catálogo já existente.
 */
export async function seedStarterContent(
  client: PrismaClient,
  tenantId: bigint,
  profile: BusinessProfileCode,
): Promise<boolean> {
  const preset = starterPresetFor(profile);
  return client.$transaction(async (transaction) => {
    const tenant = await transaction.tenant.findUnique({
      where: { id: tenantId },
      select: {
        starterContentSeededAt: true,
        starterContentIds: true,
        onboardingCompletedAt: true,
      },
    });
    if (tenant === null) return false;
    if (tenant.starterContentSeededAt !== null) {
      // Troca de tipo de negócio durante o onboarding: substitui apenas o
      // conteúdo gerado pelo sistema, e só enquanto ninguém o editou.
      const ids = storedIds(tenant.starterContentIds);
      if (tenant.onboardingCompletedAt !== null || ids === null) return false;
      if (!(await discardUntouchedStarterContent(transaction, tenantId, ids))) return false;
    }

    // Nunca semear por cima de conteúdo real já cadastrado pelo próprio usuário.
    const [services, professionals] = await Promise.all([
      transaction.service.count({ where: { tenantId } }),
      transaction.professional.count({ where: { tenantId } }),
    ]);
    if (services > 0 || professionals > 0) {
      await transaction.tenant.update({
        where: { id: tenantId },
        data: { starterContentSeededAt: new Date() },
      });
      return false;
    }
    const createdIds: StarterContentIds = { serviceIds: [], comboId: null, professionalId: null };

    const unit = await transaction.businessUnit.findFirst({
      where: { tenantId },
      orderBy: [{ isHeadquarters: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });

    // Respeita a arquitetura comercial: o mesmo gate usado na criação manual.
    const entitlements = new PlanEntitlementService();
    const createdServices: { id: bigint; priceCents: bigint }[] = [];
    for (const [index, service] of preset.services.entries()) {
      try {
        await entitlements.assertCanCreateService(transaction, tenantId);
      } catch {
        break;
      }
      const servicePublicId = randomUUID();
      createdIds.serviceIds.push(servicePublicId);
      createdServices.push(
        await transaction.service.create({
          data: {
            publicId: servicePublicId,
            tenantId,
            name: service.name,
            iconKey: service.iconKey,
            durationMinutes: service.durationMinutes,
            priceCents: BigInt(service.priceCents),
            color: SERVICE_COLOR,
            sortOrder: index,
            active: true,
          },
          select: { id: true, priceCents: true },
        }),
      );
    }

    const comboServices = preset.combo.serviceIndexes.map((position) => createdServices[position]);
    if (comboServices.every((item) => item !== undefined)) {
      const full = comboServices.reduce((total, item) => total + Number(item.priceCents), 0);
      const comboPublicId = randomUUID();
      createdIds.comboId = comboPublicId;
      const combo = await transaction.combo.create({
        data: {
          publicId: comboPublicId,
          tenantId,
          name: preset.combo.name,
          priceCents: BigInt(Math.round((full * (100 - preset.combo.discountPercent)) / 100)),
          sortOrder: 0,
          active: true,
        },
        select: { id: true },
      });
      for (const [position, item] of comboServices.entries())
        await transaction.comboItem.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            comboId: combo.id,
            serviceId: item.id,
            sortOrder: position,
          },
        });
    }

    try {
      await entitlements.assertCanCreateProfessional(transaction, tenantId);
    } catch {
      createdIds.professionalId = null;
      await transaction.tenant.update({
        where: { id: tenantId },
        data: { starterContentSeededAt: new Date(), starterContentIds: createdIds },
      });
      return createdServices.length > 0;
    }
    const professionalPublicId = randomUUID();
    createdIds.professionalId = professionalPublicId;
    const professional = await transaction.professional.create({
      data: {
        publicId: professionalPublicId,
        tenantId,
        ...(unit === null ? {} : { primaryUnitId: unit.id }),
        name: preset.professional.name,
        publicName: preset.professional.name,
        specialties: [preset.professional.specialty],
        calendarColor: SERVICE_COLOR,
        sortOrder: 0,
        active: true,
      },
      select: { id: true },
    });
    for (const service of createdServices)
      await transaction.professionalService.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          professionalId: professional.id,
          serviceId: service.id,
          active: true,
        },
      });
    if (unit !== null)
      await transaction.professionalUnit.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          professionalId: professional.id,
          unitId: unit.id,
          active: true,
        },
      });
    for (const weekday of STARTER_WEEKDAYS)
      await transaction.professionalWorkSchedule.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          professionalId: professional.id,
          ...(unit === null ? {} : { unitId: unit.id }),
          weekday,
          startsAt: STARTER_WORKDAY.startsAt,
          endsAt: STARTER_WORKDAY.endsAt,
          active: true,
        },
      });

    // App público do tenant novo já nasce no modelo e tema premium.
    await transaction.tenantPublicSite.upsert({
      where: { tenantId },
      create: { tenantId, theme: 'LUXURY', layout: 'PREMIUM_APP' },
      update: { theme: 'LUXURY', layout: 'PREMIUM_APP' },
    });
    await transaction.tenant.update({
      where: { id: tenantId },
      data: { starterContentSeededAt: new Date(), starterContentIds: createdIds },
    });
    return true;
  });
}
