import { createDatabaseConnection } from './connection.js';
import { loadEnvironment } from '../config/environment.js';

function readEmail(argumentsList: string[]): string {
  const index = argumentsList.indexOf('--email');
  const email = index === -1 ? undefined : argumentsList[index + 1];
  if (email === undefined || email.trim().length === 0) {
    throw new Error('Informe um usuário existente com --email.');
  }
  return email.trim();
}

const environment = loadEnvironment();
const email = readEmail(process.argv.slice(2));
const database = createDatabaseConnection(environment.DATABASE_URL);

try {
  if (database.platform === undefined)
    throw new Error('A administração global não está disponível.');
  const publicId = await database.platform.createInitialAdministrator(email, {
    ipAddress: null,
    userAgent: 'local-platform-administrator-command',
  });
  process.stdout.write(`Administrador global criado: ${publicId}\n`);
} finally {
  await database.close();
}
