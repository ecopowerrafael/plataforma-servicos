import { CommercialRole } from '../../database-client/client.js';
import { randomUUID } from 'crypto';

interface CreateRegionInput {
  managerId: bigint;
  name: string;
}

interface AssignCityInput {
  regionId: bigint;
  ibgeCode: string;
  city: string;
  state: string;
}

const VALID_STATES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export class CommercialRegionService {
  constructor(private prisma: any) {}

  async createRegion(input: CreateRegionInput) {
    // Validate manager exists and is MANAGER
    const manager = await this.prisma.commercialAccount.findUnique({
      where: { id: input.managerId },
    });

    if (!manager || manager.role !== CommercialRole.MANAGER) {
      throw new Error('INVALID_MANAGER');
    }

    return this.prisma.commercialRegion.create({
      data: {
        publicId: randomUUID(),
        managerId: input.managerId,
        name: input.name,
      },
      include: { manager: true, cities: true },
    });
  }

  async updateRegion(regionId: bigint, name: string) {
    return this.prisma.commercialRegion.update({
      where: { id: regionId },
      data: { name },
      include: { manager: true, cities: true },
    });
  }

  async deleteRegion(regionId: bigint) {
    return this.prisma.commercialRegion.delete({
      where: { id: regionId },
    });
  }

  async assignCity(input: AssignCityInput) {
    this.validateIbgeCode(input.ibgeCode);
    this.validateState(input.state);

    // Check if city already assigned to another active region
    const existing = await this.prisma.commercialRegionCity.findFirst({
      where: {
        ibgeCode: input.ibgeCode,
        region: { active: true },
      },
    });

    if (existing) {
      throw new Error('CITY_ALREADY_ASSIGNED');
    }

    // Get region to check it exists
    const region = await this.prisma.commercialRegion.findUnique({
      where: { id: input.regionId },
    });

    if (!region) {
      throw new Error('REGION_NOT_FOUND');
    }

    return this.prisma.commercialRegionCity.create({
      data: {
        regionId: input.regionId,
        ibgeCode: input.ibgeCode,
        city: input.city,
        state: input.state,
      },
    });
  }

  async removeCity(cityId: bigint) {
    return this.prisma.commercialRegionCity.delete({
      where: { id: cityId },
    });
  }

  async getManagerRegions(managerId: bigint) {
    return this.prisma.commercialRegion.findMany({
      where: { managerId },
      include: { cities: true },
    });
  }

  async getRegionByIbgeCode(ibgeCode: string) {
    return this.prisma.commercialRegionCity.findUnique({
      where: { ibgeCode },
      include: { region: true },
    });
  }

  private validateIbgeCode(code: string): void {
    if (!/^\d{7}$/.test(code)) {
      throw new Error('INVALID_IBGE_CODE');
    }
  }

  private validateState(state: string): void {
    if (!VALID_STATES.includes(state.toUpperCase())) {
      throw new Error('INVALID_STATE');
    }
  }

  async getRegionByPublicId(publicId: string) {
    return this.prisma.commercialRegion.findUnique({
      where: { publicId },
      include: { manager: true, cities: true },
    });
  }

  async updateRegionStatus(regionId: bigint, active: boolean) {
    return this.prisma.commercialRegion.update({
      where: { id: regionId },
      data: { active },
      include: { manager: true, cities: true },
    });
  }

  async addCitiesToRegion(regionId: bigint, cities: Array<{ ibgeCode: string; city: string; state: string }>) {
    const results = [];
    for (const city of cities) {
      results.push(await this.assignCity({ regionId, ...city }));
    }
    return results;
  }
}
