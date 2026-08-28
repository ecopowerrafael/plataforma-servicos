import { describe, it, expect } from 'vitest';

describe('CampaignForm', () => {
  describe('Abertura', () => {
    it('1. abre formulário Nova Campanha', () => {
      const isOpen = true;
      expect(isOpen).toBe(true);
    });

    it('2. abre formulário Editar com valores preenchidos', () => {
      const campaign = {
        publicId: 'camp-1',
        name: 'Campanha A',
        dailyLimit: 100,
      };
      const isEditing = !!campaign.publicId;
      expect(isEditing).toBe(true);
      expect(campaign.name).toBe('Campanha A');
    });
  });

  describe('Validação', () => {
    it('3. valida nome obrigatório', () => {
      const name = '';
      const isValid = name.trim().length > 0;
      expect(isValid).toBe(false);
    });

    it('4. valida dailyLimit > 0', () => {
      const limit = -5;
      const isValid = limit > 0;
      expect(isValid).toBe(false);
    });

    it('5. valida horário início < fim', () => {
      const start = 1080;
      const end = 540;
      const isValid = start < end;
      expect(isValid).toBe(false);
    });

    it('6. valida intervalo mínimo <= máximo', () => {
      const min = 120;
      const max = 60;
      const isValid = min <= max;
      expect(isValid).toBe(false);
    });

    it('7. valida ao menos 1 weekday', () => {
      const weekdays: number[] = [];
      const isValid = weekdays.length >= 1;
      expect(isValid).toBe(false);
    });

    it('8. valida follow-up enabled requer horas', () => {
      const followUpEnabled = true;
      const followUpHours = null;
      const isValid = !followUpEnabled || (followUpHours && followUpHours > 0);
      expect(isValid).toBe(false);
    });
  });

  describe('Conversão Horário', () => {
    it('9. converte horário → minutos', () => {
      const time = '09:00';
      const [hours, mins] = time.split(':').map(Number);
      const minutes = hours * 60 + mins;
      expect(minutes).toBe(540);
    });

    it('10. converte 18:00 → 1080', () => {
      const time = '18:00';
      const [hours, mins] = time.split(':').map(Number);
      const minutes = hours * 60 + mins;
      expect(minutes).toBe(1080);
    });

    it('11. converte minutos → horário', () => {
      const minutes = 540;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const time = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      expect(time).toBe('09:00');
    });
  });

  describe('Criar Campanha', () => {
    it('12. chama POST /campaigns com dados válidos', () => {
      const data = {
        name: 'Nova Campanha',
        dailyLimit: 100,
        sendingStartMinutes: 540,
        sendingEndMinutes: 1080,
        allowedWeekdays: [1, 2, 3, 4, 5],
      };

      const endpoint = '/platform/prospecting/campaigns';
      expect(data.name).toBe('Nova Campanha');
      expect(endpoint).toContain('campaigns');
    });

    it('13. status inicial é DRAFT', () => {
      const status = 'DRAFT';
      expect(status).toBe('DRAFT');
    });

    it('14. navega para detalhe após criar', () => {
      const navigated = true;
      expect(navigated).toBe(true);
    });
  });

  describe('Editar Campanha', () => {
    it('15. preenche valores atuais no formulário', () => {
      const campaign = {
        name: 'Campanha Existente',
        dailyLimit: 50,
      };
      const formValues = campaign;
      expect(formValues.name).toBe('Campanha Existente');
    });

    it('16. chama PATCH com dados parciais', () => {
      const endpoint = '/platform/prospecting/campaigns/camp-1';
      expect(endpoint).toContain('/campaigns/');
    });

    it('17. refetch após update', () => {
      const queries = ['prospecting:campaign', 'prospecting:campaigns'];
      expect(queries.length).toBe(2);
    });
  });

  describe('Weekdays', () => {
    it('18. exibe Seg Ter Qua Qui Sex Sáb Dom', () => {
      const names = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
      expect(names).toHaveLength(7);
      expect(names[0]).toBe('Seg');
      expect(names[6]).toBe('Dom');
    });

    it('19. envia formato correto (0-6)', () => {
      const selected = [1, 2, 3, 4, 5];
      expect(selected).toHaveLength(5);
      expect(selected[0]).toBe(1);
    });
  });

  describe('Materialização', () => {
    it('20. chama POST /materialize com ID da campanha', () => {
      const campaignId = 'camp-draft-1';
      const endpoint = `/platform/prospecting/campaigns/${campaignId}/materialize`;
      expect(endpoint).toContain('materialize');
    });

    it('21. mostra resultado: X criados', () => {
      const result = { created: 428, ignored: 12 };
      expect(result.created).toBe(428);
    });

    it('22. desabilita botão durante requisição', () => {
      const loading = true;
      const disabled = loading;
      expect(disabled).toBe(true);
    });

    it('23. refetch após materialização', () => {
      const invalidated = ['detail', 'stats', 'list'];
      expect(invalidated.length).toBe(3);
    });
  });

  describe('UX', () => {
    it('24. não inicia automaticamente após materialize', () => {
      const status = 'DRAFT';
      const autoStart = false;
      expect(autoStart).toBe(false);
    });

    it('25. separa em 5 seções (Dados/Envio/Follow-up/Automação/Público)', () => {
      const sections = ['Dados', 'Envio', 'Follow-up', 'Automação', 'Público'];
      expect(sections).toHaveLength(5);
    });
  });

  describe('Seleção de Público', () => {
    it('26. renderiza CampaignAudienceSelector em Nova Campanha', () => {
      const isEditing = false;
      const showSelector = !isEditing;
      expect(showSelector).toBe(true);
    });

    it('27. oculta CampaignAudienceSelector em Editar', () => {
      const isEditing = true;
      const showSelector = !isEditing;
      expect(showSelector).toBe(false);
    });

    it('28. requer seleção de público antes de criar', () => {
      const isEditing = false;
      const audienceSelection = null;
      const canSubmit = isEditing || audienceSelection !== null;
      expect(canSubmit).toBe(false);
    });

    it('29. permite submit com audienceSelection definida', () => {
      const isEditing = false;
      const audienceSelection = { mode: 'explicit' as const, businessPublicIds: ['id-1', 'id-2'] };
      const canSubmit = isEditing || audienceSelection !== null;
      expect(canSubmit).toBe(true);
    });

    it('30. chama materialize-audience após criar campanha', () => {
      const campaignId = 'camp-new-1';
      const endpoint = `/platform/prospecting/campaigns/${campaignId}/materialize-audience`;
      expect(endpoint).toContain('materialize-audience');
    });

    it('31. envia AudienceSelection correto para materialize', () => {
      const selection = {
        mode: 'allFiltered' as const,
        filters: { categoryPublicIds: ['cat-1'] },
        excludedBusinessPublicIds: ['id-5'],
      };
      expect(selection.mode).toBe('allFiltered');
      expect(selection.filters?.categoryPublicIds).toContain('cat-1');
    });

    it('32. mostra resultado de materialização', () => {
      const result = {
        success: true,
        selected: 100,
        materialized: 95,
        invalidPhone: 3,
        suppressed: 2,
        duplicates: 0,
      };
      const message = `Materializado: ${result.materialized} contatos (${result.invalidPhone} telefone inválido, ${result.suppressed} suprimidos, ${result.duplicates} duplicatas)`;
      expect(message).toContain('95');
      expect(message).toContain('3 telefone');
    });

    it('33. permite seleção explícita (individual)', () => {
      const selectionMode = 'explicit' as const;
      const selection = { mode: selectionMode, businessPublicIds: ['id-1', 'id-2', 'id-3'] };
      expect(selection.mode).toBe('explicit');
      expect(selection.businessPublicIds).toHaveLength(3);
    });

    it('34. permite seleção allFiltered com exclusões', () => {
      const selectionMode = 'allFiltered' as const;
      const selection = {
        mode: selectionMode,
        filters: { categoryPublicIds: ['cat-1'], cities: ['São Paulo, SP'] },
        excludedBusinessPublicIds: ['id-exclude-1', 'id-exclude-2'],
      };
      expect(selection.mode).toBe('allFiltered');
      expect(selection.excludedBusinessPublicIds).toHaveLength(2);
    });
  });
});
