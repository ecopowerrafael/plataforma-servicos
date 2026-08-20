export interface SeoBatchResult {
  processedCount: number;
  errorCount: number;
}

export interface AggregatesBatchResult {
  processed: number;
}

export interface MaintenanceStatusSnapshot {
  seoPending: number;
  aggregatePending: number;
  aggregateProcessing: number;
  aggregateFailed: number;
}

export interface MaintenanceRunner {
  runSeoBatch: () => Promise<SeoBatchResult>;
  runAggregatesBatch: () => Promise<AggregatesBatchResult>;
  /** Consultado após cada batch de aggregates e ao final — nunca inferido de `processed`. */
  getStatus: () => Promise<MaintenanceStatusSnapshot>;
  isPaused: () => boolean;
  onSeoProgress?: (update: { processed: number; errors: number }) => void;
  onAggregatesStart?: () => void;
  onAggregatesProgress?: (status: MaintenanceStatusSnapshot) => void;
}

/** 'done' só quando seoPending, aggregatePending, aggregateProcessing e aggregateFailed são todos 0. */
export type MaintenanceOutcome = 'done' | 'paused' | 'incomplete';

/**
 * Processa SEO e depois aggregates sequencialmente, um batch por vez — nunca
 * dispara a próxima chamada antes da anterior responder. `isPaused()` é
 * checado só antes de cada nova chamada, então uma requisição em andamento
 * nunca é cancelada; a pausa só impede a próxima.
 *
 * A fase de aggregates NUNCA usa `processed === 0` como critério de parada:
 * um batch pode processar 0 porque tudo que restou é FAILED aguardando
 * backoff, o que não significa fila vazia. Por isso o loop consulta
 * `getStatus()` (GET /maintenance/status) após cada batch e só para quando
 * não há mais nada *ativo* (pending + processing = 0) — e o resultado final
 * só é 'done' se, além disso, não sobrar nenhum FAILED.
 */
export async function runMaintenanceLoop(runner: MaintenanceRunner): Promise<MaintenanceOutcome> {
  let processed = 0;
  let errors = 0;
  for (;;) {
    if (runner.isPaused()) return 'paused';
    const result = await runner.runSeoBatch();
    processed += result.processedCount;
    errors += result.errorCount;
    runner.onSeoProgress?.({ processed, errors });
    if (result.processedCount === 0) break;
  }
  if (runner.isPaused()) return 'paused';
  runner.onAggregatesStart?.();
  let lastStatus: MaintenanceStatusSnapshot | undefined;
  for (;;) {
    if (runner.isPaused()) return 'paused';
    await runner.runAggregatesBatch();
    lastStatus = await runner.getStatus();
    runner.onAggregatesProgress?.(lastStatus);
    if (lastStatus.aggregatePending === 0 && lastStatus.aggregateProcessing === 0) break;
  }
  if (runner.isPaused()) return 'paused';

  const success =
    lastStatus.seoPending === 0 &&
    lastStatus.aggregatePending === 0 &&
    lastStatus.aggregateProcessing === 0 &&
    lastStatus.aggregateFailed === 0;
  return success ? 'done' : 'incomplete';
}
