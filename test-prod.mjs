import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './apps/api/src/database-client/client.js';
import { buildDatabaseUrl } from './apps/api/src/config/database-url.js';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

config({ path: resolve(import.meta.dirname, '.env'), quiet: true });

console.log('=== VALIDAÇÃO PÓS-DEPLOY ===\n');

// 1. Verificar commit atual
const result = execSync('git log -1 --oneline', { encoding: 'utf-8' }).trim();
console.log('1. Commit em produção:', result);

// 2. Verificar env vars
console.log(`\n2. Variáveis Prospecting:`);
console.log(`   PROSPECTING_WORKER_ENABLED: ${process.env.PROSPECTING_WORKER_ENABLED || 'undefined'}`);
console.log(`   PROSPECTING_DRY_RUN: ${process.env.PROSPECTING_DRY_RUN || 'undefined'}`);

// 3-5. Verificar banco
const url = buildDatabaseUrl(process.env);
const adapter = new PrismaMariaDb(url);
const client = new PrismaClient({ adapter });

try {
  const wapi = await client.prospectingWhatsAppConfig.findFirst({ where: { isActive: true } });
  console.log(`\n3. W-API: ${wapi ? '✅' : '❌'}`);
  
  const campaigns = await client.prospectingCampaign.count();
  const leads = await client.prospectingLead.count();
  const messages = await client.prospectingMessage.count();
  
  console.log(`\n4. Estado banco: Campanhas=${campaigns}, Leads=${leads}, Messages=${messages}`);
  
  const realSent = await client.prospectingMessage.count({
    where: {
      direction: 'OUTBOUND',
      status: { in: ['SENT', 'DELIVERED', 'READ'] },
      externalMessageId: { not: null }
    }
  });
  
  console.log(`\n5. Mensagens REALMENTE ENVIADAS: ${realSent} ${realSent === 0 ? '✅' : '❌'}`);
  
} finally {
  await client.$disconnect();
}
