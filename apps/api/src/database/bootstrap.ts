import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';

import { createPrismaClient } from './connection.js';
import { buildDatabaseUrl } from '../config/database-url.js';
import { PasswordService } from '../modules/auth/password.service.js';
import { PlatformService } from '../modules/platform/platform.service.js';

// Carrega o .env local (desenvolvimento) sem exigir a validação completa do
// ambiente da aplicação — o bootstrap precisa apenas da conexão com o banco,
// construída a partir de DB_*/DATABASE_URL. Assim ele roda com segurança no
// passo de build/deploy (onde nem todas as variáveis da API estão presentes).
config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });

const permissions = [
  ['tenant.read', 'Consultar dados do estabelecimento.'],
  ['tenant.update', 'Atualizar dados do estabelecimento.'],
  ['tenant.branding.read', 'Consultar a configura\u00e7\u00e3o visual do estabelecimento.'],
  ['tenant.branding.manage', 'Gerenciar identidade visual e p\u00e1gina p\u00fablica.'],
  ['tenant.subscription.read', 'Consultar o plano e a assinatura do estabelecimento.'],
  ['unit.read', 'Consultar unidades.'],
  ['unit.create', 'Criar unidades.'],
  ['unit.update', 'Atualizar unidades.'],
  ['membership.read', 'Consultar membros.'],
  ['membership.invite', 'Convidar membros.'],
  ['membership.update', 'Atualizar membros.'],
  ['membership.suspend', 'Suspender ou reativar membros.'],
  ['role.read', 'Consultar papéis.'],
  ['role.manage', 'Gerenciar papéis permitidos.'],
  ['session.read_own', 'Consultar as próprias sessões.'],
  ['session.revoke_own', 'Revogar as próprias sessões.'],
  ['audit.read', 'Consultar auditoria do estabelecimento.'],
  ['service.read', 'Consultar serviços.'],
  ['service.create', 'Criar serviços.'],
  ['service.update', 'Atualizar serviços.'],
  ['service.status.manage', 'Ativar ou desativar serviços.'],
  ['service.image.manage', 'Gerenciar imagens de serviços.'],
  ['service.category.read', 'Consultar categorias de servi\u00e7os.'],
  ['service.category.create', 'Criar categorias de servi\u00e7os.'],
  ['service.category.update', 'Atualizar categorias de servi\u00e7os.'],
  ['service.category.status.manage', 'Ativar ou desativar categorias de servi\u00e7os.'],
  ['service.variation.read', 'Consultar varia\u00e7\u00f5es de servi\u00e7os.'],
  ['service.variation.manage', 'Gerenciar varia\u00e7\u00f5es de servi\u00e7os.'],
  ['combo.read', 'Consultar combos.'],
  ['combo.create', 'Criar combos.'],
  ['combo.update', 'Atualizar combos.'],
  ['combo.status.manage', 'Ativar ou desativar combos.'],
  ['combo.image.manage', 'Gerenciar imagens de combos.'],
  ['professional.read', 'Consultar profissionais.'],
  ['professional.create', 'Criar profissionais.'],
  ['professional.update', 'Atualizar profissionais.'],
  ['professional.status.manage', 'Ativar ou desativar profissionais.'],
  ['professional.image.manage', 'Gerenciar fotos de profissionais.'],
  ['professional.service.read', 'Consultar vínculos de profissionais e serviços.'],
  ['professional.service.manage', 'Gerenciar vínculos de profissionais e serviços.'],
  ['professional.unit.read', 'Consultar vínculos de profissionais e unidades.'],
  ['professional.unit.manage', 'Gerenciar vínculos de profissionais e unidades.'],
  ['professional.schedule.read', 'Consultar jornadas de profissionais.'],
  ['professional.schedule.manage', 'Gerenciar jornadas de profissionais.'],
  ['professional.unavailability.read', 'Consultar indisponibilidades de profissionais.'],
  ['professional.unavailability.manage', 'Gerenciar indisponibilidades de profissionais.'],
  ['customer.read', 'Consultar clientes.'],
  ['customer.create', 'Criar clientes.'],
  ['customer.update', 'Atualizar clientes.'],
  ['customer.status.manage', 'Ativar ou desativar clientes.'],
  ['calendar.read', 'Consultar agenda interna.'],
  ['availability.read', 'Consultar horários disponíveis.'],
  ['appointment.read', 'Consultar agendamentos.'],
  ['appointment.create', 'Criar agendamentos.'],
  ['appointment.update', 'Atualizar agendamentos.'],
  ['appointment.status.manage', 'Gerenciar status de agendamentos.'],
  ['appointment.fit_in.manage', 'Criar encaixes administrativos na agenda.'],
  ['appointment.checkin.manage', 'Registrar check-in de agendamentos na recepção.'],
  ['appointment.waitlist.read', 'Consultar lista de espera de agendamentos.'],
  ['appointment.waitlist.manage', 'Gerenciar oportunidades e conversões da lista de espera.'],
  ['professional.self.read', 'Consultar o próprio perfil profissional e a própria agenda.'],
  [
    'professional.self.update',
    'Atualizar os próprios atendimentos (observações e status permitido ao profissional).',
  ],
  ['notification.read', 'Consultar o log de notificações enviadas pelo estabelecimento.'],
  ['notification.template.manage', 'Personalizar os modelos de mensagens de notificação.'],
  ['product.read', 'Consultar categorias e produtos.'],
  ['product.manage', 'Gerenciar categorias e produtos.'],
  ['stock.read', 'Consultar estoque por unidade.'],
  ['stock.manage', 'Definir estoque por unidade.'],
  ['product_sale.read', 'Consultar vendas de produtos.'],
  ['product_sale.manage', 'Registrar vendas de produtos.'],
  ['payment.read', 'Consultar pagamentos registrados nos agendamentos.'],
  ['payment.manage', 'Registrar e cancelar pagamentos de agendamentos.'],
  ['cash.read', 'Consultar caixas, movimentações e saldo.'],
  ['cash.manage', 'Abrir e fechar caixa e registrar movimentações manuais.'],
  ['commission.read', 'Consultar comissões geradas a partir de pagamentos reais.'],
  ['financial_closing.read', 'Consultar fechamentos financeiros por período.'],
  ['financial_closing.manage', 'Realizar e cancelar fechamentos financeiros por período.'],
  ['financial_report.read', 'Consultar e exportar relatórios financeiros completos.'],
  ['payment_gateway.read', 'Consultar a configuração do gateway de pagamento.'],
  [
    'payment_gateway.manage',
    'Configurar o gateway de pagamento do estabelecimento, incluindo credenciais.',
  ],
  ['automation.read', 'Consultar automações e regras de recuperação de clientes.'],
  ['automation.manage', 'Configurar automações e regras de recuperação de clientes.'],
  ['coupon.read', 'Consultar cupons de desconto do estabelecimento.'],
  ['coupon.manage', 'Criar, atualizar e aplicar cupons de desconto.'],
  ['loyalty.read', 'Consultar regras e saldos de fidelidade (pontos e cashback).'],
  ['loyalty.manage', 'Configurar regras de fidelidade e resgatar pontos/cashback em agendamentos.'],
  ['integration.read', 'Consultar integrações externas do estabelecimento.'],
  ['integration.manage', 'Configurar integrações externas do estabelecimento.'],
  ['collection.read', 'Consultar dívidas e réguas de cobrança do estabelecimento.'],
  ['collection.manage', 'Criar, atualizar e administrar dívidas e réguas de cobrança.'],
] as const;

const roles = [
  {
    code: 'OWNER',
    name: 'Proprietário',
    description: 'Responsável principal pelo estabelecimento.',
    permissions: permissions.map(([code]) => code),
  },
  {
    code: 'MANAGER',
    name: 'Gerente',
    description: 'Gerencia a operação e os membros autorizados.',
    permissions: [
      'tenant.read',
      'tenant.update',
      'tenant.branding.read',
      'tenant.branding.manage',
      'tenant.subscription.read',
      'unit.read',
      'unit.create',
      'unit.update',
      'membership.read',
      'membership.invite',
      'membership.update',
      'membership.suspend',
      'role.read',
      'session.read_own',
      'session.revoke_own',
      'audit.read',
      'service.read',
      'service.create',
      'service.update',
      'service.status.manage',
      'service.image.manage',
      'service.category.read',
      'service.category.create',
      'service.category.update',
      'service.category.status.manage',
      'service.variation.read',
      'service.variation.manage',
      'combo.read',
      'combo.create',
      'combo.update',
      'combo.status.manage',
      'combo.image.manage',
      'professional.read',
      'professional.create',
      'professional.update',
      'professional.status.manage',
      'professional.image.manage',
      'professional.service.read',
      'professional.service.manage',
      'professional.unit.read',
      'professional.unit.manage',
      'professional.schedule.read',
      'professional.schedule.manage',
      'professional.unavailability.read',
      'professional.unavailability.manage',
      'customer.read',
      'customer.create',
      'customer.update',
      'customer.status.manage',
      'calendar.read',
      'availability.read',
      'appointment.read',
      'appointment.create',
      'appointment.update',
      'appointment.status.manage',
      'appointment.fit_in.manage',
      'appointment.checkin.manage',
      'appointment.waitlist.read',
      'appointment.waitlist.manage',
      'notification.read',
      'notification.template.manage',
      'product.read',
      'product.manage',
      'stock.read',
      'stock.manage',
      'product_sale.read',
      'product_sale.manage',
      'payment.read',
      'payment.manage',
      'cash.read',
      'cash.manage',
      'commission.read',
      'financial_closing.read',
      'financial_closing.manage',
      'financial_report.read',
      'payment_gateway.read',
      'automation.read',
      'automation.manage',
      'coupon.read',
      'coupon.manage',
      'loyalty.read',
      'loyalty.manage',
      'integration.read',
      'integration.manage',
      'collection.read',
      'collection.manage',
    ],
  },
  {
    code: 'RECEPTIONIST',
    name: 'Recepcionista',
    description: 'Opera a recepção: consulta agendamentos, registra check-in e recebe pagamentos.',
    permissions: [
      'tenant.read',
      'unit.read',
      'membership.read',
      'session.read_own',
      'session.revoke_own',
      'customer.read',
      'appointment.read',
      'appointment.waitlist.read',
      'appointment.checkin.manage',
      'payment.read',
      'payment.manage',
      'cash.read',
      'cash.manage',
      'coupon.read',
      'coupon.manage',
      'loyalty.read',
      'loyalty.manage',
    ],
  },
  {
    code: 'PROFESSIONAL',
    name: 'Profissional',
    description: 'Acessa somente informações básicas autorizadas.',
    permissions: [
      'tenant.read',
      'unit.read',
      'session.read_own',
      'session.revoke_own',
      'professional.self.read',
      'professional.self.update',
    ],
  },
] as const;

const platformPermissions = [
  ['platform.dashboard.read', 'Consultar o painel global.'],
  ['platform.tenant.read', 'Consultar estabelecimentos globalmente.'],
  ['platform.tenant.create', 'Provisionar estabelecimentos.'],
  ['platform.tenant.update', 'Atualizar dados administrativos de estabelecimentos.'],
  ['platform.tenant.status.manage', 'Gerenciar status operacional de estabelecimentos.'],
  ['platform.plan.read', 'Consultar planos comerciais.'],
  ['platform.plan.create', 'Criar planos comerciais.'],
  ['platform.plan.update', 'Atualizar planos comerciais.'],
  ['platform.plan.status.manage', 'Gerenciar status de planos comerciais.'],
  ['platform.subscription.read', 'Consultar assinaturas comerciais.'],
  ['platform.subscription.create', 'Criar assinaturas comerciais.'],
  ['platform.subscription.update', 'Atualizar assinaturas comerciais.'],
  ['platform.subscription.status.manage', 'Gerenciar status de assinaturas comerciais.'],
  ['platform.audit.read', 'Consultar auditoria global.'],
  ['platform.metrics.read', 'Consultar métricas globais.'],
  ['platform.commercial_policy.read', 'Consultar a política comercial global.'],
  ['platform.commercial_policy.manage', 'Gerenciar a política comercial global.'],
  ['platform.prospecting.read', 'Consultar configuração de prospecção.'],
  ['platform.prospecting.update', 'Gerenciar templates, objections e padrões de prospecção.'],
  ['platform.worker.execute', 'Executar workers manualmente.'],
] as const;

const objectionDefaults = [
  {
    code: 'INTERESSADO',
    name: 'Interessado',
    description: 'Lead mostrou interesse no produto/serviço',
    suggestedResponse: 'Ótimo! Posso te enviar uma demonstração gratuita. Em qual horário você fica disponível?',
    autoReplyAllowed: true,
    patterns: [
      { type: 'EXACT', text: 'tenho interesse', priority: 10 },
      { type: 'EXACT', text: 'gostei', priority: 10 },
      { type: 'EXACT', text: 'quero testar', priority: 10 },
      { type: 'EXACT', text: 'quero conhecer', priority: 10 },
      { type: 'CONTAINS', text: 'interessado', priority: 5 },
      { type: 'CONTAINS', text: 'gostei da ideia', priority: 8 },
    ],
  },
  {
    code: 'SEM_INTERESSE',
    name: 'Sem Interesse',
    description: 'Lead indicou não ter interesse',
    suggestedResponse: 'Tudo bem! Qualquer dúvida no futuro, estou à disposição.',
    autoReplyAllowed: false,
    patterns: [
      { type: 'EXACT', text: 'nao tenho interesse', priority: 10 },
      { type: 'EXACT', text: 'nao me interessa', priority: 10 },
      { type: 'EXACT', text: 'obrigado mas nao', priority: 10 },
      { type: 'CONTAINS', text: 'sem interesse', priority: 8 },
      { type: 'CONTAINS', text: 'nao quero', priority: 7 },
    ],
  },
  {
    code: 'JA_USA_SISTEMA',
    name: 'Já Usa Sistema',
    description: 'Lead já utiliza sistema concorrente ou solução similar',
    suggestedResponse: 'Entendo! O Agendei pode complementar sua solução atual. Quer conversar sobre integração?',
    autoReplyAllowed: true,
    patterns: [
      { type: 'EXACT', text: 'ja tenho sistema', priority: 10 },
      { type: 'EXACT', text: 'ja uso outro sistema', priority: 10 },
      { type: 'EXACT', text: 'ja tenho aplicativo', priority: 10 },
      { type: 'CONTAINS', text: 'ja tenho solucao', priority: 8 },
      { type: 'CONTAINS', text: 'uso outro', priority: 7 },
    ],
  },
  {
    code: 'PRECO',
    name: 'Preço',
    description: 'Lead questionou preço ou achou caro',
    suggestedResponse: 'Posso te mostrar os diferentes planos e como isso se encaixa no seu orçamento.',
    autoReplyAllowed: true,
    patterns: [
      { type: 'EXACT', text: 'quanto custa', priority: 10 },
      { type: 'EXACT', text: 'qual valor', priority: 10 },
      { type: 'EXACT', text: 'qual o preco', priority: 10 },
      { type: 'EXACT', text: 'muito caro', priority: 10 },
      { type: 'CONTAINS', text: 'custa', priority: 6 },
      { type: 'CONTAINS', text: 'preco', priority: 6 },
    ],
  },
  {
    code: 'SEM_TEMPO',
    name: 'Sem Tempo Agora',
    description: 'Lead está ocupado agora mas aberto para conversa depois',
    suggestedResponse: 'Sem problema! Quando você tem um tempo para conversar com calma?',
    autoReplyAllowed: false,
    patterns: [
      { type: 'EXACT', text: 'agora nao posso', priority: 10 },
      { type: 'EXACT', text: 'estou ocupado', priority: 10 },
      { type: 'EXACT', text: 'sem tempo agora', priority: 10 },
      { type: 'EXACT', text: 'nao posso agora', priority: 10 },
      { type: 'CONTAINS', text: 'agora nao', priority: 7 },
    ],
  },
  {
    code: 'FALAR_DEPOIS',
    name: 'Falar Depois',
    description: 'Lead quer conversar em outro momento',
    suggestedResponse: 'Perfeito! Em qual data você prefere que eu entre em contato novamente?',
    autoReplyAllowed: false,
    patterns: [
      { type: 'EXACT', text: 'me chama depois', priority: 10 },
      { type: 'EXACT', text: 'fala comigo depois', priority: 10 },
      { type: 'EXACT', text: 'me chama outro dia', priority: 10 },
      { type: 'EXACT', text: 'amanha ligamos', priority: 10 },
      { type: 'CONTAINS', text: 'me chama depois', priority: 8 },
      { type: 'CONTAINS', text: 'outro dia', priority: 7 },
    ],
  },
  {
    code: 'QUER_SABER_MAIS',
    name: 'Quer Saber Mais',
    description: 'Lead interessado em aprender mais',
    suggestedResponse: 'Claro! Deixa eu te enviar mais informações sobre como funciona.',
    autoReplyAllowed: true,
    patterns: [
      { type: 'EXACT', text: 'como funciona', priority: 9 },
      { type: 'EXACT', text: 'me explica', priority: 9 },
      { type: 'EXACT', text: 'quero saber mais', priority: 9 },
      { type: 'EXACT', text: 'qual a diferenca', priority: 8 },
      { type: 'CONTAINS', text: 'como funciona', priority: 7 },
    ],
  },
  {
    code: 'NAO_ENTENDEU',
    name: 'Não Entendeu',
    description: 'Lead não compreendeu a proposta',
    suggestedResponse: 'Deixa eu tentar explicar melhor. Qual parte ficou confusa?',
    autoReplyAllowed: true,
    patterns: [
      { type: 'EXACT', text: 'nao entendi', priority: 10 },
      { type: 'EXACT', text: 'entendi nao', priority: 10 },
      { type: 'CONTAINS', text: 'nao entendi', priority: 8 },
      { type: 'CONTAINS', text: 'confuso', priority: 6 },
    ],
  },
  {
    code: 'CONTATO_ERRADO',
    name: 'Contato Errado',
    description: 'Número ou pessoa errada',
    suggestedResponse: 'Desculpa o incômodo! Você conhece alguém que pudesse estar interessado?',
    autoReplyAllowed: false,
    patterns: [
      { type: 'EXACT', text: 'numero errado', priority: 10 },
      { type: 'EXACT', text: 'contato errado', priority: 10 },
      { type: 'EXACT', text: 'nao sou o responsavel', priority: 10 },
      { type: 'CONTAINS', text: 'errado', priority: 5 },
    ],
  },
];

async function seedProspectingObjections(
  transaction: any,
): Promise<void> {
  for (const objData of objectionDefaults) {
    const existing = await transaction.prospectingObjection.findUnique({
      where: { code: objData.code },
    });

    if (existing) {
      continue;
    }

    const objection = await transaction.prospectingObjection.create({
      data: {
        publicId: randomUUID(),
        code: objData.code,
        name: objData.name,
        description: objData.description,
        suggestedResponse: objData.suggestedResponse,
        autoReplyAllowed: objData.autoReplyAllowed,
        isActive: true,
      },
    });

    for (const pattern of objData.patterns) {
      await transaction.prospectingObjectionPattern.create({
        data: {
          objectionId: objection.id,
          patternType: pattern.type as any,
          pattern: pattern.text,
          priority: pattern.priority,
        },
      });
    }
  }
}

async function seedProspectingTemplates(
  transaction: any,
): Promise<void> {
  const defaultTemplates = [
    {
      stepNumber: 1,
      name: 'Abordagem Inicial',
      body: 'Olá {{nome}}, tudo bem? Falo da {{empresa}}. Posso te fazer uma pergunta rápida?',
    },
    {
      stepNumber: 2,
      name: 'Follow-up',
      body: 'Oi {{nome}}, passando novamente porque talvez minha mensagem anterior tenha ficado perdida. Posso te explicar rapidamente o motivo do contato?',
    },
    {
      stepNumber: 3,
      name: 'Último Contato',
      body: 'Olá {{nome}}, este é meu último contato por aqui. Se fizer sentido conversar, fico à disposição.',
    },
  ];

  const campaigns = await transaction.prospectingCampaign.findMany({
    select: { id: true },
  });

  for (const campaign of campaigns) {
    for (const template of defaultTemplates) {
      const existing = await transaction.prospectingTemplate.findFirst({
        where: {
          campaignId: campaign.id,
          stepNumber: template.stepNumber,
        },
      });

      if (!existing) {
        await transaction.prospectingTemplate.create({
          data: {
            publicId: randomUUID(),
            campaignId: campaign.id,
            stepNumber: template.stepNumber,
            name: template.name,
            body: template.body,
            isDefault: true,
          },
        });
      }
    }
  }
}

async function seedProspectingFlows(
  transaction: any,
): Promise<void> {
  const existing = await transaction.prospectingFlow.findUnique({
    where: { code: 'DIRECTORY_PUBLICATION' },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  const flow = await transaction.prospectingFlow.create({
    data: {
      publicId: randomUUID(),
      code: 'DIRECTORY_PUBLICATION',
      name: 'Divulgação de Estabelecimento',
      description: 'Fluxo de autorização de divulgação e coleta de dados',
      isActive: true,
    },
  });

  const step1 = await transaction.prospectingFlowStep.create({
    data: {
      publicId: randomUUID(),
      flowId: flow.id,
      name: 'Pedido de autorização',
      message: 'Olá {{estabelecimento}}!\n\nGostaria de saber se você autoriza a divulgação do seu estabelecimento em nosso site.\n\nAproveitando, poderia confirmar se este endereço está correto?\n\n{{endereco}}',
      stepType: 'MESSAGE_OPTIONS',
      position: 1,
      isStart: true,
    },
  });

  const step2 = await transaction.prospectingFlowStep.create({
    data: {
      publicId: randomUUID(),
      flowId: flow.id,
      name: 'Como faz agendamento',
      message: 'Obrigado pela autorização!\n\nPara completar seus dados, gostaria de saber se vocês possuem algum link para agendamento, site ou aplicativo, ou se o agendamento é feito somente pelo WhatsApp?',
      stepType: 'MESSAGE_OPTIONS',
      position: 2,
    },
  });

  const step4 = await transaction.prospectingFlowStep.create({
    data: {
      publicId: randomUUID(),
      flowId: flow.id,
      name: 'Apresentação Agendei',
      message: 'Entendi!\n\nEntão acredito que posso te mostrar algo interessante.\n\nO Agendei permite que seus clientes façam agendamentos pelo celular sem depender de resposta manual no WhatsApp.\n\nAlém disso, organiza sua agenda, envia lembretes, confirma atendimentos e ajuda no acompanhamento dos clientes.',
      stepType: 'MESSAGE_OPTIONS',
      position: 4,
    },
  });

  const step3 = await transaction.prospectingFlowStep.create({
    data: {
      publicId: randomUUID(),
      flowId: flow.id,
      name: 'Aguardar link',
      message: 'Perfeito! Pode me enviar o link por aqui.',
      stepType: 'WAIT_LINK',
      position: 3,
      nextStepId: step4.id,
    },
  });

  const stepEnd = await transaction.prospectingFlowStep.create({
    data: {
      publicId: randomUUID(),
      flowId: flow.id,
      name: 'Encerramento',
      message: 'Obrigado pelo tempo! Qualquer dúvida, estou à disposição.',
      stepType: 'END',
      position: 5,
    },
  });

  const opt1Step1 = await transaction.prospectingFlowOption.create({
    data: {
      publicId: randomUUID(),
      stepId: step1.id,
      label: 'Autorizo',
      nextStepId: step2.id,
      actionType: 'NEXT_STEP',
      position: 1,
    },
  });
  await transaction.prospectingFlowOptionPattern.createMany({
    data: [
      { optionId: opt1Step1.id, pattern: 'autorizo', patternType: 'EXACT', priority: 10 },
      { optionId: opt1Step1.id, pattern: 'pode divulgar', patternType: 'CONTAINS', priority: 8 },
      { optionId: opt1Step1.id, pattern: 'pode sim', patternType: 'CONTAINS', priority: 7 },
      { optionId: opt1Step1.id, pattern: 'autorizado', patternType: 'CONTAINS', priority: 7 },
    ],
  });

  const opt2Step1 = await transaction.prospectingFlowOption.create({
    data: {
      publicId: randomUUID(),
      stepId: step1.id,
      label: 'Não autorizo',
      nextStepId: stepEnd.id,
      actionType: 'NEXT_STEP',
      position: 2,
    },
  });
  await transaction.prospectingFlowOptionPattern.createMany({
    data: [
      { optionId: opt2Step1.id, pattern: 'não autorizo', patternType: 'EXACT', priority: 10 },
      { optionId: opt2Step1.id, pattern: 'nao autorizo', patternType: 'EXACT', priority: 10 },
      { optionId: opt2Step1.id, pattern: 'não quero divulgar', patternType: 'CONTAINS', priority: 8 },
      { optionId: opt2Step1.id, pattern: 'nao quero divulgar', patternType: 'CONTAINS', priority: 8 },
    ],
  });

  const opt1Step2 = await transaction.prospectingFlowOption.create({
    data: {
      publicId: randomUUID(),
      stepId: step2.id,
      label: 'Tenho sim, vou fornecer o link',
      nextStepId: step3.id,
      actionType: 'NEXT_STEP',
      position: 1,
    },
  });
  await transaction.prospectingFlowOptionPattern.createMany({
    data: [
      { optionId: opt1Step2.id, pattern: 'tenho link', patternType: 'CONTAINS', priority: 8 },
      { optionId: opt1Step2.id, pattern: 'vou mandar o link', patternType: 'CONTAINS', priority: 8 },
      { optionId: opt1Step2.id, pattern: 'tenho site', patternType: 'CONTAINS', priority: 7 },
      { optionId: opt1Step2.id, pattern: 'tenho aplicativo', patternType: 'CONTAINS', priority: 7 },
    ],
  });

  const opt2Step2 = await transaction.prospectingFlowOption.create({
    data: {
      publicId: randomUUID(),
      stepId: step2.id,
      label: 'Não tenho, só WhatsApp',
      nextStepId: step4.id,
      actionType: 'NEXT_STEP',
      position: 2,
    },
  });
  await transaction.prospectingFlowOptionPattern.createMany({
    data: [
      { optionId: opt2Step2.id, pattern: 'só whatsapp', patternType: 'CONTAINS', priority: 8 },
      { optionId: opt2Step2.id, pattern: 'somente whatsapp', patternType: 'CONTAINS', priority: 8 },
      { optionId: opt2Step2.id, pattern: 'não tenho', patternType: 'CONTAINS', priority: 7 },
      { optionId: opt2Step2.id, pattern: 'nao tenho', patternType: 'CONTAINS', priority: 7 },
    ],
  });

  // Step 3 (WAIT_LINK) automatically continues to step4 via nextStepId
  // No option needed for WAIT_LINK type

  await transaction.prospectingFlowOption.createMany({
    data: [
      {
        publicId: randomUUID(),
        stepId: step4.id,
        label: 'Quero conhecer',
        nextStepId: null,
        actionType: 'MANUAL',
        position: 1,
      },
      {
        publicId: randomUUID(),
        stepId: step4.id,
        label: 'Quanto custa?',
        nextStepId: null,
        actionType: 'MANUAL',
        position: 2,
      },
      {
        publicId: randomUUID(),
        stepId: step4.id,
        label: 'Agora não',
        nextStepId: stepEnd.id,
        actionType: 'NEXT_STEP',
        position: 3,
      },
      {
        publicId: randomUUID(),
        stepId: step4.id,
        label: 'Não tenho interesse',
        nextStepId: stepEnd.id,
        actionType: 'NEXT_STEP',
        position: 4,
      },
    ],
  });
}

async function bootstrap(): Promise<void> {
  const databaseUrl = buildDatabaseUrl(process.env);
  if (databaseUrl === undefined) {
    throw new Error(
      'Configuração de banco ausente: defina DATABASE_URL ou DB_NAME/DB_USER/DB_PASSWORD.',
    );
  }
  const client = createPrismaClient(databaseUrl);
  try {
    await client.$transaction(async (transaction) => {
      for (const [code, description] of permissions) {
        await transaction.permission.upsert({
          where: { code },
          create: { code, description },
          update: {},
        });
      }
      for (const roleDefinition of roles) {
        const role = await transaction.role.upsert({
          where: { code: roleDefinition.code },
          create: {
            publicId: crypto.randomUUID(),
            code: roleDefinition.code,
            name: roleDefinition.name,
            description: roleDefinition.description,
            isSystem: true,
          },
          update: {},
        });
        const rolePermissions = await transaction.permission.findMany({
          where: { code: { in: [...roleDefinition.permissions] } },
          select: { id: true },
        });
        await transaction.rolePermission.createMany({
          data: rolePermissions.map(({ id: permissionId }) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
      for (const [code, description] of platformPermissions) {
        await transaction.platformPermission.upsert({
          where: { code },
          create: { code, description },
          update: {},
        });
      }
      const platformRole = await transaction.platformRole.upsert({
        where: { code: 'PLATFORM_ADMIN' },
        create: {
          code: 'PLATFORM_ADMIN',
          name: 'Administrador da plataforma',
          description: 'Administração global da plataforma.',
          isSystem: true,
        },
        update: {},
      });
      const globalPermissions = await transaction.platformPermission.findMany({
        where: { code: { in: platformPermissions.map(([code]) => code) } },
        select: { id: true },
      });
      await transaction.platformRolePermission.createMany({
        data: globalPermissions.map(({ id: permissionId }) => ({
          roleId: platformRole.id,
          permissionId,
        })),
        skipDuplicates: true,
      });

      await seedProspectingObjections(transaction);
      await seedProspectingTemplates(transaction);
      await seedProspectingFlows(transaction);
    });

    // Provisionamento idempotente do primeiro Super Admin durante o deploy,
    // quando PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD estão presentes. Cria o
    // usuário (senha só como hash argon2) se não existir e o promove a
    // PLATFORM_ADMIN; se já existir, não altera a senha. A senha nunca é logada.
    const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim();
    const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
    if (
      adminEmail !== undefined &&
      adminEmail.length > 0 &&
      adminPassword !== undefined &&
      adminPassword.length > 0
    ) {
      const platform = new PlatformService(client);
      const passwords = new PasswordService({
        memoryCost: Number(process.env.PASSWORD_ARGON2_MEMORY_COST) || 65_536,
        timeCost: Number(process.env.PASSWORD_ARGON2_TIME_COST) || 3,
        parallelism: Number(process.env.PASSWORD_ARGON2_PARALLELISM) || 1,
      });
      const result = await platform.ensureInitialAdministrator({
        email: adminEmail,
        hashPassword: () => passwords.hash(adminPassword),
        metadata: { ipAddress: null, userAgent: 'bootstrap-platform-admin-provisioning' },
      });
      process.stdout.write(`Administrador da plataforma provisionado: ${result} (${adminEmail})\n`);
    }
  } finally {
    await client.$disconnect();
  }
}

await bootstrap();
