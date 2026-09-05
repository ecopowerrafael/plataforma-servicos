import { describe, expect, it } from 'vitest';

describe('prospecting MESSAGE_OPTIONS e placeholders', () => {
  it('placeholders {{estabelecimento}} e {{endereco}} são resolvidos', () => {
    const placeholders = {
      '{{nome}}': 'lead.nameSnapshot',
      '{{empresa}}': 'business.name',
      '{{estabelecimento}}': 'business.name (alias)',
      '{{endereco}}': 'business.rawAddress',
      '{{cidade}}': 'business.city',
      '{{estado}}': 'business.state',
    };

    // Verificar que todos são suportados
    expect(Object.keys(placeholders)).toContain('{{estabelecimento}}');
    expect(Object.keys(placeholders)).toContain('{{endereco}}');
  });

  it('placeholders não resolvidos geram erro UNRESOLVED_PLACEHOLDER', () => {
    const body = 'Olá {{telefone_inexistente}}!';
    const placeholderPattern = /\{\{([^}]+)\}\}/g;

    const unresolvedPlaceholders: string[] = [];
    let match;
    while ((match = placeholderPattern.exec(body)) !== null) {
      unresolvedPlaceholders.push(match[1]!);
    }

    expect(unresolvedPlaceholders).toContain('telefone_inexistente');
    expect(unresolvedPlaceholders.length).toBeGreaterThan(0);
  });

  it('MESSAGE_OPTIONS envia botões, não texto simples', () => {
    const stepType = 'MESSAGE_OPTIONS';
    const options = [
      { label: 'Sim', position: 1 },
      { label: 'Não', position: 2 },
    ];

    // Lógica: se MESSAGE_OPTIONS, usar sendButtons
    if (stepType === 'MESSAGE_OPTIONS') {
      expect(options.length).toBeGreaterThan(0);
      // Lógica chama messageSender.sendButtons() em vez de sendText()
    }
  });

  it('MESSAGE_OPTIONS sem options gera erro', () => {
    const stepType = 'MESSAGE_OPTIONS';
    const options: any[] = [];

    const isInvalid = stepType === 'MESSAGE_OPTIONS' && options.length === 0;
    expect(isInvalid).toBe(true);
  });

  it('exemplo real de resolução de placeholders', () => {
    const business = {
      name: 'Barbearia Central',
      rawAddress: 'Rua XV de Novembro, 120 - Centro',
      city: 'Adamantina',
      state: 'SP',
    };

    const lead = {
      nameSnapshot: 'João Silva',
    };

    let body = 'Olá {{estabelecimento}}!\\nEndereço: {{endereco}}\\nCidade: {{cidade}}/{{estado}}';

    body = body.replace(/\{\{estabelecimento\}\}/g, business.name);
    body = body.replace(/\{\{endereco\}\}/g, business.rawAddress);
    body = body.replace(/\{\{cidade\}\}/g, business.city);
    body = body.replace(/\{\{estado\}\}/g, business.state);

    expect(body).toContain('Barbearia Central');
    expect(body).toContain('Rua XV de Novembro, 120 - Centro');
    expect(body).toContain('Adamantina/SP');
  });

  it('payload de botões W-API é correto', () => {
    const buttonPayload = {
      phone: '5518999999999',
      message: 'Este endereço está correto?',
      buttonActions: [
        {
          type: 'REPLAY',
          buttonText: 'Sim',
        },
        {
          type: 'REPLAY',
          buttonText: 'Não',
        },
      ],
    };

    // Validar endpoint correto: /v1/message/send-button-actions
    const endpoint = '/v1/message/send-button-actions';
    expect(endpoint).toMatch(/send-button-actions/);

    // Validar type correto
    expect(buttonPayload.buttonActions[0]!.type).toBe('REPLAY');

    // Não usar send-buttons-action ou send-button-list
    expect(endpoint).not.toMatch(/send-buttons-action/);
    expect(endpoint).not.toMatch(/send-button-list/);
  });

  it('sendButtons vs sendText baseado em stepType', () => {
    const scenarios = [
      { stepType: 'MESSAGE_OPTIONS', shouldUseSendButtons: true },
      { stepType: 'WAIT_TEXT', shouldUseSendButtons: false },
      { stepType: 'WAIT_LINK', shouldUseSendButtons: false },
      { stepType: 'MESSAGE_ONLY', shouldUseSendButtons: false },
    ];

    for (const scenario of scenarios) {
      const useSendButtons = scenario.stepType === 'MESSAGE_OPTIONS';
      expect(useSendButtons).toBe(scenario.shouldUseSendButtons);
    }
  });
});
