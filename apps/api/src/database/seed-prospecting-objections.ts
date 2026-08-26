import { createPrismaClient } from './connection.js';
import { buildDatabaseUrl } from '../config/database-url.js';
import { randomUUID } from 'node:crypto';

const databaseUrl = buildDatabaseUrl();
if (!databaseUrl) {
  throw new Error('DATABASE_URL not configured');
}
const client = createPrismaClient(databaseUrl);

const objections = [
  {
    code: 'INTERESSADO',
    name: 'Interessado',
    description: 'Lead mostrou interesse no produto/serviço',
    suggestedResponse: 'Ótimo! Posso te enviar uma demonstração gratuita. Em qual horário você fica disponível?',
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
    patterns: [
      { type: 'EXACT', text: 'numero errado', priority: 10 },
      { type: 'EXACT', text: 'contato errado', priority: 10 },
      { type: 'EXACT', text: 'nao sou o responsavel', priority: 10 },
      { type: 'CONTAINS', text: 'errado', priority: 5 },
    ],
  },
];

async function seedObjections() {
  console.log('🌱 Seeding ProspectingObjection...');

  for (const objData of objections) {
    // Check if already exists
    const existing = await client.prospectingObjection.findUnique({
      where: { code: objData.code },
    });

    if (existing) {
      console.log(`  ✓ ${objData.code} já existe`);
      continue;
    }

    // Create objection
    const objection = await client.prospectingObjection.create({
      data: {
        publicId: randomUUID(),
        code: objData.code,
        name: objData.name,
        description: objData.description,
        suggestedResponse: objData.suggestedResponse,
        isActive: true,
      },
    });

    console.log(`  ✓ ${objData.code} criado (id=${objection.id})`);

    // Create patterns
    for (const pattern of objData.patterns) {
      await client.prospectingObjectionPattern.create({
        data: {
          objectionId: objection.id,
          patternType: pattern.type as any,
          pattern: pattern.text,
          priority: pattern.priority,
        },
      });
    }

    console.log(`    └─ ${objData.patterns.length} padrões criados`);
  }

  console.log('✅ Seed concluído');
}

seedObjections()
  .catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  })
  .finally(() => {
    client.$disconnect();
  });
