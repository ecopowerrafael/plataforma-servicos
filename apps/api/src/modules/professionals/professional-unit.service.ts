import { randomUUID } from 'node:crypto';

import {
  type UpsertProfessionalUnitRequest,
  ProfessionalUnitsResponseSchema,
} from '@plataforma/shared';

import { type PrismaProfessionalUnitRepository } from './professional-unit.repository.js';
import { AppError } from '../../errors/AppError.js';

interface LinkRecord {
  publicId: string;
  professional: { publicId: string };
  unit: { publicId: string };
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Actor {
  userId: bigint;
  sessionId: bigint | null;
}

const pub = (x: LinkRecord) => ({
  publicId: x.publicId,
  professionalPublicId: x.professional.publicId,
  unitPublicId: x.unit.publicId,
  active: x.active,
  createdAt: x.createdAt.toISOString(),
  updatedAt: x.updatedAt.toISOString(),
});

export class ProfessionalUnitLinkService {
  public constructor(private readonly repo: PrismaProfessionalUnitRepository) {}

  async listProfessional(t: bigint, p: string) {
    return ProfessionalUnitsResponseSchema.parse({
      items: (await this.repo.listByProfessional(t, p)).map(pub),
    });
  }

  async listUnit(t: bigint, u: string) {
    return ProfessionalUnitsResponseSchema.parse({
      items: (await this.repo.listByUnit(t, u)).map(pub),
    });
  }

  async upsert(
    t: bigint,
    p: string,
    input: UpsertProfessionalUnitRequest,
    a: Actor,
  ) {
    const [pro, unit] = await Promise.all([
      this.repo.findProfessional(t, p),
      this.repo.findUnit(t, input.unitPublicId),
    ]);
    if (!pro || !unit)
      throw new AppError({
        code: 'PROFESSIONAL_UNIT_NOT_FOUND',
        message: 'Profissional ou unidade não encontrado.',
        statusCode: 404,
      });
    const old = await this.repo.find(t, pro.id, unit.id);
    if (old === null && !pro.active)
      throw new AppError({
        code: 'PROFESSIONAL_UNIT_INACTIVE',
        message: 'Profissionais inativos não podem receber novos vínculos.',
        statusCode: 400,
      });
    const item = await this.repo.upsert({
      publicId: old?.publicId ?? randomUUID(),
      tenantId: t,
      professionalId: pro.id,
      unitId: unit.id,
      active: input.active,
    });
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId: t,
      userId: a.userId,
      sessionId: a.sessionId,
      action: old === null ? 'professional_unit.created' : 'professional_unit.updated',
      targetType: 'professional_unit',
      targetPublicId: item.publicId,
    });
    return pub(item);
  }
  async status(t: bigint, p: string, u: string, active: boolean, a: Actor) {
    const pro = await this.repo.findProfessional(t, p);
    const unit = await this.repo.findUnit(t, u);
    if (!pro || !unit)
      throw new AppError({
        code: 'PROFESSIONAL_UNIT_NOT_FOUND',
        message: 'Vínculo não encontrado.',
        statusCode: 404,
      });
    const item = await this.repo.find(t, pro.id, unit.id);
    if (!item)
      throw new AppError({
        code: 'PROFESSIONAL_UNIT_NOT_FOUND',
        message: 'Vínculo não encontrado.',
        statusCode: 404,
      });
    await this.repo.update(item.id, { active });
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId: t,
      userId: a.userId,
      sessionId: a.sessionId,
      action: active ? 'professional_unit.activated' : 'professional_unit.deactivated',
      targetType: 'professional_unit',
      targetPublicId: item.publicId,
    });
  }
}
