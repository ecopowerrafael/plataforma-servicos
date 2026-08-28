import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type PrismaClient } from '../../database-client/client.js';
import { ProspectingAudienceService } from './prospecting-audience.service.js';
import { ProspectingRepository } from './prospecting.repository.js';

describe('ProspectingAudienceService', () => {
  let mockClient: any;
  let service: ProspectingAudienceService;

  beforeEach(() => {
    mockClient = {
      directoryBusiness: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      directoryCategory: {
        findMany: vi.fn(),
      },
      prospectingLeads: {
        findMany: vi.fn(),
      },
      prospectingSuppression: {
        findMany: vi.fn(),
      },
    } as unknown as PrismaClient;

    service = new ProspectingAudienceService(mockClient);
  });

  describe('resolveFilteredBusinessPublicIds', () => {
    it('1. retorna publicIds de todos os negócios quando sem filtros', async () => {
      mockClient.directoryBusiness.findMany.mockResolvedValue([
        { publicId: 'id-1' },
        { publicId: 'id-2' },
        { publicId: 'id-3' },
      ]);

      const result = await service.resolveFilteredBusinessPublicIds({});

      expect(result).toEqual(['id-1', 'id-2', 'id-3']);
      expect(mockClient.directoryBusiness.findMany).toHaveBeenCalled();
    });

    it('2. exclui publicIds fornecidos em excludedPublicIds', async () => {
      mockClient.directoryBusiness.findMany.mockResolvedValue([
        { publicId: 'id-1' },
        { publicId: 'id-2' },
        { publicId: 'id-3' },
      ]);

      const result = await service.resolveFilteredBusinessPublicIds({}, ['id-2']);

      expect(result).toEqual(['id-1', 'id-3']);
    });

    it('3. filtra por categoryPublicIds', async () => {
      mockClient.directoryCategory.findMany.mockResolvedValue([{ id: BigInt(1) }]);
      mockClient.directoryBusiness.findMany.mockResolvedValue([
        { publicId: 'id-1' },
        { publicId: 'id-2' },
      ]);

      const result = await service.resolveFilteredBusinessPublicIds({
        categoryPublicIds: ['cat-1'],
      });

      expect(result).toEqual(['id-1', 'id-2']);
      expect(mockClient.directoryCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publicId: { in: ['cat-1'] } },
        })
      );
    });

    it('4. retorna vazio quando nenhum negócio encontrado', async () => {
      mockClient.directoryBusiness.findMany.mockResolvedValue([]);

      const result = await service.resolveFilteredBusinessPublicIds({});

      expect(result).toEqual([]);
    });
  });

  describe('getPreviewCounters', () => {
    it('5. retorna contadores corretos', async () => {
      mockClient.directoryBusiness.count.mockResolvedValue(100);

      const result = await service.getPreviewCounters({});

      expect(result.total).toBe(100);
      expect(result.withPhone).toBe(100);
    });

    it('6. diferencia nunca contatado vs já contatado', async () => {
      mockClient.directoryBusiness.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80) // withPhone
        .mockResolvedValueOnce(60); // neverContacted

      const result = await service.getPreviewCounters({});

      expect(result.neverContacted).toBe(60);
      expect(result.contacted).toBe(20); // 80 - 60
    });
  });

  describe('getPreviewPage', () => {
    it('7. retorna status correto baseado em OUTBOUND messages', async () => {
      mockClient.directoryBusiness.findMany.mockResolvedValue([
        {
          publicId: 'id-1',
          name: 'Negócio 1',
          whatsapp: '11999999999',
          city: 'São Paulo',
          state: 'SP',
          prospectingLeads: [],
          prospectingMessages: [], // Sem OUTBOUND
          category: { name: 'Cat 1' },
        },
        {
          publicId: 'id-2',
          name: 'Negócio 2',
          whatsapp: '11999999998',
          city: 'São Paulo',
          state: 'SP',
          prospectingLeads: [],
          prospectingMessages: [{ id: 1 }], // Com OUTBOUND
          category: { name: 'Cat 1' },
        },
        {
          publicId: 'id-3',
          name: 'Negócio 3',
          whatsapp: '11999999997',
          city: 'São Paulo',
          state: 'SP',
          prospectingLeads: [{ respondedAt: new Date() }], // Respondeu
          prospectingMessages: [{ id: 2 }],
          category: { name: 'Cat 1' },
        },
      ]);
      mockClient.directoryBusiness.count.mockResolvedValue(3);

      const result = await service.getPreviewPage({}, 1, 50);

      expect(result.data[0].status).toBe('Nunca enviado');
      expect(result.data[1].status).toBe('Já enviado');
      expect(result.data[2].status).toBe('Respondeu');
    });

    it('8. paginação funciona corretamente', async () => {
      mockClient.directoryBusiness.findMany.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({
          publicId: `id-${i}`,
          name: `Negócio ${i}`,
          whatsapp: '11999999999',
          city: 'São Paulo',
          state: 'SP',
          prospectingLeads: [],
          prospectingMessages: [],
          category: { name: 'Cat 1' },
        }))
      );
      mockClient.directoryBusiness.count.mockResolvedValue(150);

      const result1 = await service.getPreviewPage({}, 1, 50);
      const result2 = await service.getPreviewPage({}, 2, 50);

      expect(result1.pagination.page).toBe(1);
      expect(result1.pagination.pages).toBe(3);
      expect(result2.pagination.page).toBe(2);
    });
  });
});

describe('ProspectingRepository - materializeLeadsSelective', () => {
  let mockClient: any;
  let repository: ProspectingRepository;

  beforeEach(() => {
    mockClient = {
      directoryBusiness: {
        findMany: vi.fn(),
      },
      prospectingSuppression: {
        findMany: vi.fn(),
      },
      prospectingLead: {
        findMany: vi.fn(),
        createMany: vi.fn(),
      },
    } as unknown as PrismaClient;

    vi.mock('../integrations/whatsapp-phone.js', () => ({
      normalizeWhatsAppPhone: (phone: string) => {
        if (!phone) return null;
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) return null;
        return digits.length === 10 ? `55${digits}` : (digits.startsWith('55') ? digits : `55${digits}`);
      },
    }));

    repository = new ProspectingRepository(mockClient);
  });

  it('9. materializa somente negócios explicitamente selecionados', async () => {
    const campaignId = BigInt(1);
    const businessPublicIds = ['id-1', 'id-2'];

    mockClient.directoryBusiness.findMany.mockResolvedValue([
      { id: BigInt(1), publicId: 'id-1', whatsapp: '11999999999' },
      { id: BigInt(2), publicId: 'id-2', whatsapp: '11999999998' },
    ]);
    mockClient.prospectingSuppression.findMany.mockResolvedValue([]);
    mockClient.prospectingLead.findMany.mockResolvedValue([]);
    mockClient.prospectingLead.createMany.mockResolvedValue({ count: 2 });

    const result = await repository.materializeLeadsSelective(campaignId, businessPublicIds);

    expect(result.materialized).toBe(2);
    expect(result.invalidPhone).toBe(0);
    expect(result.suppressed).toBe(0);
    expect(result.duplicates).toBe(0);
  });

  it('10. retorna contadores corretos para telefone inválido', async () => {
    const campaignId = BigInt(1);
    const businessPublicIds = ['id-1', 'id-2'];

    mockClient.directoryBusiness.findMany.mockResolvedValue([
      { id: BigInt(1), publicId: 'id-1', whatsapp: '11999999999' },
      { id: BigInt(2), publicId: 'id-2', whatsapp: 'invalid' },
    ]);
    mockClient.prospectingSuppression.findMany.mockResolvedValue([]);
    mockClient.prospectingLead.findMany.mockResolvedValue([]);
    mockClient.prospectingLead.createMany.mockResolvedValue({ count: 1 });

    const result = await repository.materializeLeadsSelective(campaignId, businessPublicIds);

    expect(result.materialized).toBe(1);
    expect(result.invalidPhone).toBe(1);
  });

  it('11. detecta duplicatas existentes', async () => {
    const campaignId = BigInt(1);
    const businessPublicIds = ['id-1', 'id-2'];

    mockClient.directoryBusiness.findMany.mockResolvedValue([
      { id: BigInt(1), publicId: 'id-1', whatsapp: '11999999999' },
      { id: BigInt(2), publicId: 'id-2', whatsapp: '11999999998' },
    ]);
    mockClient.prospectingSuppression.findMany.mockResolvedValue([]);
    mockClient.prospectingLead.findMany.mockResolvedValue([
      { directoryBusinessId: BigInt(1) }, // id-1 já existe
    ]);
    mockClient.prospectingLead.createMany.mockResolvedValue({ count: 1 });

    const result = await repository.materializeLeadsSelective(campaignId, businessPublicIds);

    expect(result.materialized).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it('12. respeita suppression', async () => {
    const campaignId = BigInt(1);
    const businessPublicIds = ['id-1', 'id-2'];

    mockClient.directoryBusiness.findMany.mockResolvedValue([
      { id: BigInt(1), publicId: 'id-1', whatsapp: '11999999999' },
      { id: BigInt(2), publicId: 'id-2', whatsapp: '11999999998' },
    ]);
    mockClient.prospectingSuppression.findMany.mockResolvedValue([
      { normalizedPhone: '5511999999998' },
    ]);
    mockClient.prospectingLead.findMany.mockResolvedValue([]);
    mockClient.prospectingLead.createMany.mockResolvedValue({ count: 1 });

    const result = await repository.materializeLeadsSelective(campaignId, businessPublicIds);

    expect(result.materialized).toBe(1);
    expect(result.suppressed).toBe(1);
  });

  it('13. retorna vazio quando nenhum businessPublicId fornecido', async () => {
    const campaignId = BigInt(1);

    const result = await repository.materializeLeadsSelective(campaignId, []);

    expect(result.materialized).toBe(0);
    expect(result.invalidPhone).toBe(0);
    expect(result.suppressed).toBe(0);
    expect(result.duplicates).toBe(0);
  });

  it('14. grava nameSnapshot com nome real do estabelecimento', async () => {
    const campaignId = BigInt(1);
    const businessPublicIds = ['id-1'];

    mockClient.directoryBusiness.findMany.mockResolvedValue([
      { id: BigInt(1), publicId: 'id-1', name: 'Negócio Real', whatsapp: '11999999999' },
    ]);
    mockClient.prospectingSuppression.findMany.mockResolvedValue([]);
    mockClient.prospectingLead.findMany.mockResolvedValue([]);

    let capturedLeads: any[] = [];
    mockClient.prospectingLead.createMany.mockImplementation((opts: any) => {
      capturedLeads = opts.data;
      return Promise.resolve({ count: 1 });
    });

    await repository.materializeLeadsSelective(campaignId, businessPublicIds);

    expect(capturedLeads).toHaveLength(1);
    expect(capturedLeads[0].nameSnapshot).toBe('Negócio Real');
    expect(capturedLeads[0].nameSnapshot).not.toBe('');
  });
});
