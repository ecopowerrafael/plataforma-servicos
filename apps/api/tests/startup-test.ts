import { buildApp } from '../src/app.js';
import { databaseOptionsFromEnvironment } from '../src/config/database-options.js';
import { loadEnvironment } from '../src/config/environment.js';
import { createDatabaseConnection } from '../src/database/connection.js';

async function testStartup() {
  console.log('🚀 Iniciando teste de startup...');

  try {
    console.log('📦 Carregando environment...');
    const environment = loadEnvironment();

    console.log('📦 Criando database connection...');
    const database = createDatabaseConnection(
      environment.DATABASE_URL,
      databaseOptionsFromEnvironment(environment),
      environment,
    );

    console.log('📦 Chamando buildApp({ environment, database })...');
    const app = await buildApp({ environment, database });

    console.log('✅ buildApp() retornou com sucesso');

    console.log('🔧 Chamando app.ready()...');
    await app.ready();

    console.log('✅ app.ready() completou com sucesso');

    console.log('🛑 Fechando app...');
    await app.close();

    console.log('✅ App fechado com sucesso');
    console.log('🎉 Startup test PASSOU');
    process.exit(0);
  } catch (error) {
    console.error('❌ ERRO DURANTE STARTUP:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
      stack: error instanceof Error ? error.stack : undefined,
      cause:
        error instanceof Error && 'cause' in error ? String(error.cause) : undefined,
    });
    process.exit(1);
  }
}

void testStartup();
