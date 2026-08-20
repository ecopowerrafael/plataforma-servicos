export interface SeoBatchResult {
  processedCount: number;
  errorCount: number;
}

export interface AggregatesBatchResult {
  processed: number;
}

export interface MaintenanceRunner {
  runSeoBatch: () => Promise<SeoBatchResult>;
  runAggregatesBatch: () => Promise<AggregatesBatchResult>;
  isPaused: () => boolean;
  onSeoProgress?: (update: { processed: number; errors: number }) => void;
  onAggregatesStart?: () => void;
}

/**
 * Processa SEO e depois aggregates sequencialmente, um batch por vez — nunca
 * dispara a próxima chamada antes da anterior responder. `isPaused()` é
 * checado só antes de cada nova chamada, então uma requisição em andamento
 * nunca é cancelada; a pausa só impede a próxima.
 */
export async function runMaintenanceLoop(runner: MaintenanceRunner): Promise<'done' | 'paused'> {
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
  for (;;) {
    if (runner.isPaused()) return 'paused';
    const result = await runner.runAggregatesBatch();
    if (result.processed === 0) break;
  }
  return runner.isPaused() ? 'paused' : 'done';
}
