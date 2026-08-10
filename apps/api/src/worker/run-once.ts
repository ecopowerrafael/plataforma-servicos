import pino from 'pino';

import { databaseOptionsFromEnvironment } from '../config/database-options.js';
import { EnvironmentValidationError, loadEnvironment } from '../config/environment.js';
import { createDatabaseConnection } from '../database/connection.js';

/**
 * Executa UMA rodada das tarefas periódicas da plataforma e encerra o processo.
 *
 * Em hospedagens que não mantêm um worker contínuo vivo (ex.: Node.js
 * compartilhado da Hostinger, onde a aplicação web pode hibernar sem tráfego),
 * este script é chamado por um agendador/cron externo. As tarefas são
 * exatamente as mesmas do worker em processo (`notification-worker.ts`), na
 * mesma ordem — nenhuma regra de negócio é alterada, apenas o disparo:
 *   1. agenda lembretes de agendamentos na janela de lembrete;
 *   2. processa automações de notificação;
 *   3. processa recuperação de clientes;
 *   4. expira pontos/benefícios de fidelidade vencidos;
 *   5. varre assinaturas comerciais (trial/carência/suspensão);
 *   6. processa a fila pendente de notificações.
 *
 * O claim atômico em `NotificationService.processPending()` já impede
 * processamento duplicado caso o worker contínuo também esteja ativo, então
 * rodar ambos é seguro (embora redundante).
 */
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.apiKey', '*.DATABASE_URL'],
    censor: '[REDACTED]',
  },
});

async function runOnce(): Promise<void> {
  const environment = loadEnvironment();
  const database = createDatabaseConnection(
    environment.DATABASE_URL,
    databaseOptionsFromEnvironment(environment),
  );

  try {
    if (database.appointmentReminders !== undefined) {
      await database.appointmentReminders.scheduleUpcomingReminders();
    }
    await database.automations?.run();
    await database.customerRecovery?.run();
    await database.loyalty?.expireDue();
    await database.commercialSweep?.run();
    if (database.notifications !== undefined) {
      await database.notifications.processPending();
    }
    logger.info('Rodada de tarefas periódicas concluída.');
  } finally {
    await database.close();
  }
}

async function main(): Promise<void> {
  try {
    await runOnce();
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      logger.fatal({ fields: error.fields }, error.message);
    } else {
      logger.fatal({ err: error }, 'Falha ao executar a rodada de tarefas periódicas.');
    }
    process.exitCode = 1;
  }
}

void main();
