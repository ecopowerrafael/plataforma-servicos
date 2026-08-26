import { createPrismaClient } from './connection.js';
import { buildDatabaseUrl } from '../config/database-url.js';
import { randomUUID } from 'node:crypto';

const databaseUrl = buildDatabaseUrl();
if (!databaseUrl) {
  throw new Error('DATABASE_URL not configured');
}
const client = createPrismaClient(databaseUrl);

const templates = [
  {
    stepNumber: 1,
    name: 'Abordagem Inicial',
    body: 'Olá {{nome}}, tudo bem? Falo da {{empresa}}. Posso te fazer uma pergunta rápida?',
    isDefault: true,
  },
  {
    stepNumber: 2,
    name: 'Follow-up',
    body: 'Oi {{nome}}, passando novamente porque talvez minha mensagem anterior tenha ficado perdida. Posso te explicar rapidamente o motivo do contato?',
    isDefault: true,
  },
  {
    stepNumber: 3,
    name: 'Último Contato',
    body: 'Olá {{nome}}, este é meu último contato por aqui. Se fizer sentido conversar, fico à disposição.',
    isDefault: true,
  },
];

async function seedTemplates() {
  console.log('🌱 Seeding ProspectingTemplate...');

  for (const tmplData of templates) {
    // Check if default template for this step already exists
    const existing = await client.prospectingTemplate.findFirst({
      where: {
        stepNumber: tmplData.stepNumber,
        isDefault: true,
      },
    });

    if (existing) {
      console.log(`  ✓ Step ${tmplData.stepNumber} já existe (${existing.name})`);
      continue;
    }

    // Create template
    const template = await client.prospectingTemplate.create({
      data: {
        publicId: randomUUID(),
        stepNumber: tmplData.stepNumber,
        name: tmplData.name,
        body: tmplData.body,
        isDefault: tmplData.isDefault,
      },
    });

    console.log(`  ✓ Step ${tmplData.stepNumber} criado: ${template.name}`);
  }

  console.log('✅ Seed concluído');
}

seedTemplates()
  .catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  })
  .finally(() => {
    client.$disconnect();
  });
