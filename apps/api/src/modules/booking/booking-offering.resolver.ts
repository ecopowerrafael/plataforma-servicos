import { resolveComboTiming, type ComboItemTiming } from '@plataforma/shared';

import { type PrismaComboRepository } from '../services/combo.repository.js';
import { type PrismaServiceRepository } from '../services/service.repository.js';
import { AppError } from '../../errors/AppError.js';

export type BookingOffering =
  | {
      kind: 'service';
      serviceId: bigint;
      servicePublicId: string;
      name: string;
      priceCents: bigint;
      durationMinutes: number;
      postServiceBreakMinutes: number;
      blockedMinutes: number;
    }
  | {
      kind: 'combo';
      comboId: bigint;
      comboPublicId: string;
      name: string;
      priceCents: bigint;
      durationMinutes: number;
      postServiceBreakMinutes: number;
      blockedMinutes: number;
    };

interface ProfessionalServiceLink {
  active: boolean;
  durationMinutes: number | null;
  hasPostServiceBreak: boolean | null;
  postServiceBreakMinutes: number | null;
}

/**
 * Resolve booking offering (service or combo) with professional service link overrides.
 *
 * Returns normalized structure with timing calculated for the specific professional.
 */
export async function resolveBookingOffering(
  tenantId: bigint,
  servicePublicId: string | undefined,
  comboPublicId: string | undefined,
  professionalId: bigint,
  serviceRepository: PrismaServiceRepository,
  comboRepository: PrismaComboRepository,
  linkLoader: (tenantId: bigint, professionalId: bigint, serviceId: bigint) => Promise<ProfessionalServiceLink | null>,
): Promise<BookingOffering> {
  // Validate XOR
  const hasService = servicePublicId !== undefined;
  const hasCombo = comboPublicId !== undefined;

  if ((hasService && hasCombo) || (!hasService && !hasCombo)) {
    throw new AppError({
      code: 'BOOKING_OFFERING_REQUIRED',
      message: 'Informe exatamente um: serviço ou combo.',
      statusCode: 400,
    });
  }

  if (hasService) {
    const service = await serviceRepository.find(tenantId, servicePublicId);
    if (!service) {
      throw new AppError({
        code: 'SERVICE_NOT_FOUND',
        message: 'Serviço não encontrado.',
        statusCode: 404,
      });
    }

    if (!service.active) {
      throw new AppError({
        code: 'SERVICE_INACTIVE',
        message: 'Serviço indisponível.',
        statusCode: 400,
      });
    }

    const link = await linkLoader(tenantId, professionalId, service.id);

    const durationMinutes = link?.durationMinutes ?? service.durationMinutes;
    const hasPostServiceBreak = link?.hasPostServiceBreak ?? service.hasPostServiceBreak;
    const postServiceBreakMinutes = hasPostServiceBreak
      ? (link?.postServiceBreakMinutes ?? service.postServiceBreakMinutes)
      : 0;

    return {
      kind: 'service',
      serviceId: service.id,
      servicePublicId: service.publicId,
      name: service.name,
      priceCents: service.priceCents,
      durationMinutes,
      postServiceBreakMinutes,
      blockedMinutes: durationMinutes + postServiceBreakMinutes,
    };
  }

  // Combo path
  if (!comboPublicId) throw new Error('comboPublicId required for combo path');
  const combo = await comboRepository.find(tenantId, comboPublicId);
  if (!combo) {
    throw new AppError({
      code: 'COMBO_NOT_FOUND',
      message: 'Combo não encontrado.',
      statusCode: 404,
    });
  }

  if (!combo.active) {
    throw new AppError({
      code: 'COMBO_INACTIVE',
      message: 'Combo indisponível.',
      statusCode: 400,
    });
  }

  if (combo.items.length === 0) {
    throw new AppError({
      code: 'COMBO_EMPTY',
      message: 'Combo sem itens.',
      statusCode: 400,
    });
  }

  // Validate all services in combo are active
  for (const item of combo.items) {
    if (!item.service.active) {
      throw new AppError({
        code: 'COMBO_SERVICE_INACTIVE',
        message: `Serviço "${item.service.name}" do combo está inativo.`,
        statusCode: 400,
      });
    }
  }

  // Load links for each service in combo and build timing items
  const timingItems: ComboItemTiming[] = [];
  for (const item of combo.items) {
    const link = await linkLoader(tenantId, professionalId, item.serviceId);
    if (!link?.active) {
      throw new AppError({
        code: 'COMBO_PROFESSIONAL_INELIGIBLE',
        message: `Profissional não está vinculado ao serviço "${item.service.name}" do combo.`,
        statusCode: 400,
      });
    }

    timingItems.push({
      serviceId: item.serviceId,
      service: {
        durationMinutes: item.service.durationMinutes,
        hasPostServiceBreak: item.service.hasPostServiceBreak,
        postServiceBreakMinutes: item.service.postServiceBreakMinutes,
      },
      link: link ?? undefined,
    });
  }

  // Resolve timing with overrides
  const timing = resolveComboTiming(timingItems);

  return {
    kind: 'combo',
    comboId: combo.id,
    comboPublicId: combo.publicId,
    name: combo.name,
    priceCents: combo.priceCents,
    durationMinutes: timing.durationMinutes,
    postServiceBreakMinutes: timing.postServiceBreakMinutes,
    blockedMinutes: timing.blockedMinutes,
  };
}
