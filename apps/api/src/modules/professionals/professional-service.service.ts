import { randomUUID } from 'node:crypto';

import {
  type UpsertProfessionalServiceRequest,
  type BulkUpsertProfessionalServiceRequest,
  ProfessionalCommissionResponseSchema,
  ProfessionalServicesResponseSchema,
} from '@plataforma/shared';

import { type PrismaProfessionalServiceRepository } from './professional-service.repository.js';
import { type CommissionType } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
interface LinkRecord {
  publicId: string;
  professional: { publicId: string };
  service: { publicId: string };
  priceCents: bigint | null;
  durationMinutes: number | null;
  hasPostServiceBreak: boolean | null;
  postServiceBreakMinutes: number | null;
  commissionType: CommissionType | null;
  commissionValue: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
const pub = (x: LinkRecord) => ({
  publicId: x.publicId,
  professionalPublicId: x.professional.publicId,
  servicePublicId: x.service.publicId,
  priceCents: x.priceCents === null ? null : Number(x.priceCents),
  durationMinutes: x.durationMinutes,
  hasPostServiceBreak: x.hasPostServiceBreak,
  postServiceBreakMinutes: x.postServiceBreakMinutes,
  commissionType: x.commissionType,
  commissionValue: x.commissionValue,
  active: x.active,
  createdAt: x.createdAt.toISOString(),
  updatedAt: x.updatedAt.toISOString(),
});
export class ProfessionalServiceLinkService {
  public constructor(private readonly repo: PrismaProfessionalServiceRepository) {}
  async listProfessional(t: bigint, p: string) {
    return ProfessionalServicesResponseSchema.parse({
      items: (await this.repo.listByProfessional(t, p)).map(pub),
    });
  }
  async listService(t: bigint, s: string) {
    return ProfessionalServicesResponseSchema.parse({
      items: (await this.repo.listByService(t, s)).map(pub),
    });
  }
  async commissions(
    t: bigint,
    professionalPublicId: string,
    defaultCommission: { type: CommissionType; value: number },
  ) {
    const items = await this.repo.listByProfessional(t, professionalPublicId);
    return ProfessionalCommissionResponseSchema.parse({
      defaultCommissionType: defaultCommission.type,
      defaultCommissionValue: defaultCommission.value,
      services: items.map((item) => ({
        servicePublicId: item.service.publicId,
        serviceName: item.service.name,
        active: item.active,
        overrideCommissionType: item.commissionType,
        overrideCommissionValue: item.commissionValue,
        effectiveCommissionType: item.commissionType ?? defaultCommission.type,
        effectiveCommissionValue: item.commissionValue ?? defaultCommission.value,
      })),
    });
  }
  async upsert(
    t: bigint,
    p: string,
    input: UpsertProfessionalServiceRequest,
    a: { userId: bigint; sessionId: bigint },
  ) {
    const [pro, ser] = await Promise.all([
      this.repo.findProfessional(t, p),
      this.repo.findService(t, input.servicePublicId),
    ]);
    if (!pro || !ser)
      throw new AppError({
        code: 'PROFESSIONAL_SERVICE_NOT_FOUND',
        message: 'Profissional ou serviço não encontrado.',
        statusCode: 404,
      });
    const old = await this.repo.find(t, pro.id, ser.id);
    if (old === null && (!pro.active || !ser.active))
      throw new AppError({
        code: 'PROFESSIONAL_SERVICE_INACTIVE',
        message: 'Itens inativos não podem receber novos vínculos.',
        statusCode: 400,
      });
    if (input.hasPostServiceBreak === true && input.postServiceBreakMinutes === 0)
      throw new AppError({
        code: 'PROFESSIONAL_SERVICE_BREAK_INVALID',
        message: 'Informe uma pausa maior que zero.',
        statusCode: 400,
      });
    const item = await this.repo.upsert({
      publicId: old?.publicId ?? randomUUID(),
      tenantId: t,
      professionalId: pro.id,
      serviceId: ser.id,
      priceCents:
        input.priceCents === null || input.priceCents === undefined
          ? null
          : BigInt(input.priceCents),
      durationMinutes: input.durationMinutes ?? null,
      hasPostServiceBreak: input.hasPostServiceBreak ?? null,
      postServiceBreakMinutes: input.postServiceBreakMinutes ?? null,
      commissionType: input.commissionType ?? null,
      commissionValue: input.commissionValue ?? null,
      active: input.active,
    });
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId: t,
      userId: a.userId,
      sessionId: a.sessionId,
      action: old === null ? 'professional_service.created' : 'professional_service.updated',
      targetType: 'professional_service',
      targetPublicId: item.publicId,
    });
    return pub(item);
  }
  async status(
    t: bigint,
    p: string,
    s: string,
    active: boolean,
    a: { userId: bigint; sessionId: bigint },
  ) {
    const pro = await this.repo.findProfessional(t, p);
    const ser = await this.repo.findService(t, s);
    if (!pro || !ser)
      throw new AppError({
        code: 'PROFESSIONAL_SERVICE_NOT_FOUND',
        message: 'Vínculo não encontrado.',
        statusCode: 404,
      });
    const item = await this.repo.find(t, pro.id, ser.id);
    if (!item)
      throw new AppError({
        code: 'PROFESSIONAL_SERVICE_NOT_FOUND',
        message: 'Vínculo não encontrado.',
        statusCode: 404,
      });
    await this.repo.update(item.id, { active });
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId: t,
      userId: a.userId,
      sessionId: a.sessionId,
      action: active ? 'professional_service.activated' : 'professional_service.deactivated',
      targetType: 'professional_service',
      targetPublicId: item.publicId,
    });
  }
  async bulkUpsert(
    t: bigint,
    p: string,
    input: BulkUpsertProfessionalServiceRequest,
    a: { userId: bigint; sessionId: bigint },
  ) {
    const pro = await this.repo.findProfessional(t, p);
    if (!pro)
      throw new AppError({
        code: 'PROFESSIONAL_NOT_FOUND',
        message: 'Profissional não encontrado.',
        statusCode: 404,
      });
    if (!pro.active)
      throw new AppError({
        code: 'PROFESSIONAL_INACTIVE',
        message: 'Profissional inativo não pode ter serviços vinculados.',
        statusCode: 400,
      });
    const serviceResults = await Promise.all(
      input.desiredServicePublicIds.map((id: string) => this.repo.findService(t, id)),
    );
    for (const s of serviceResults) {
      if (!s)
        throw new AppError({
          code: 'SERVICE_NOT_FOUND',
          message: 'Um ou mais serviços não foram encontrados.',
          statusCode: 404,
        });
    }
    const services = serviceResults.filter((s) => s !== null && s !== undefined);
    const existing = await this.repo.listByProfessional(t, p);
    const desiredSet = new Set(services.map((s) => s.id));
    const existingMap = new Map(existing.map((x) => [x.service.id, x]));
    for (const [serviceId, link] of existingMap) {
      if (!desiredSet.has(serviceId)) {
        await this.repo.update(link.id, { active: false });
        await this.repo.audit({
          publicId: randomUUID(),
          tenantId: t,
          userId: a.userId,
          sessionId: a.sessionId,
          action: 'professional_service.deactivated',
          targetType: 'professional_service',
          targetPublicId: link.publicId,
        });
      } else if (!link.active) {
        await this.repo.update(link.id, { active: true });
        await this.repo.audit({
          publicId: randomUUID(),
          tenantId: t,
          userId: a.userId,
          sessionId: a.sessionId,
          action: 'professional_service.activated',
          targetType: 'professional_service',
          targetPublicId: link.publicId,
        });
      }
    }
    for (const service of services) {
      if (!existingMap.has(service.id)) {
        const newLink = await this.repo.upsert({
          publicId: randomUUID(),
          tenantId: t,
          professionalId: pro.id,
          serviceId: service.id,
          priceCents: null,
          durationMinutes: null,
          hasPostServiceBreak: null,
          postServiceBreakMinutes: null,
          commissionType: null,
          commissionValue: null,
          active: true,
        });
        await this.repo.audit({
          publicId: randomUUID(),
          tenantId: t,
          userId: a.userId,
          sessionId: a.sessionId,
          action: 'professional_service.created',
          targetType: 'professional_service',
          targetPublicId: newLink.publicId,
        });
      }
    }
    return ProfessionalServicesResponseSchema.parse({
      items: (await this.repo.listByProfessional(t, p)).map(pub),
    });
  }
}
