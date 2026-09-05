import { describe, expect, it, vi } from 'vitest';

import { runMaintenanceLoop, type MaintenanceStatusSnapshot } from './directory-maintenance-runner.js';

const cleanStatus = (): MaintenanceStatusSnapshot => ({
  seoPending: 0,
  aggregatePending: 0,
  aggregateProcessing: 0,
  aggregateFailed: 0,
});

describe('runMaintenanceLoop', () => {
  it('processa SEO sequencialmente até processedCount = 0, depois aggregates até a fila esvaziar', async () => {
    const callOrder: string[] = [];
    let seoCall = 0;
    const runSeoBatch = vi.fn(async () => {
      callOrder.push(`seo-${String(seoCall)}`);
      seoCall += 1;
      return seoCall <= 3 ? { processedCount: 200, errorCount: 0 } : { processedCount: 0, errorCount: 0 };
    });
    let aggCall = 0;
    const runAggregatesBatch = vi.fn(async () => {
      callOrder.push(`agg-${String(aggCall)}`);
      aggCall += 1;
      return { processed: aggCall <= 2 ? 10 : 0 };
    });
    const getStatus = vi.fn(async () =>
      aggCall < 3 ? { ...cleanStatus(), aggregatePending: 3 - aggCall } : cleanStatus(),
    );

    const outcome = await runMaintenanceLoop({ runSeoBatch, runAggregatesBatch, getStatus, isPaused: () => false });

    expect(outcome).toBe('done');
    expect(runSeoBatch).toHaveBeenCalledTimes(4);
    expect(runAggregatesBatch).toHaveBeenCalledTimes(3);
    expect(callOrder).toEqual(['seo-0', 'seo-1', 'seo-2', 'seo-3', 'agg-0', 'agg-1', 'agg-2']);
  });

  it('nunca dispara a próxima chamada antes da anterior responder (processamento sequencial, não paralelo)', async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    let calls = 0;
    const runSeoBatch = vi.fn(async () => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      calls += 1;
      return calls <= 3 ? { processedCount: 50, errorCount: 0 } : { processedCount: 0, errorCount: 0 };
    });
    const runAggregatesBatch = vi.fn(async () => ({ processed: 0 }));
    const getStatus = vi.fn(async () => cleanStatus());

    await runMaintenanceLoop({ runSeoBatch, runAggregatesBatch, getStatus, isPaused: () => false });

    expect(maxConcurrent).toBe(1);
  });

  it('pausa antes da próxima chamada de SEO, sem cancelar a chamada em andamento', async () => {
    let calls = 0;
    let paused = false;
    const runSeoBatch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) paused = true;
      return { processedCount: 100, errorCount: 0 };
    });
    const runAggregatesBatch = vi.fn(async () => ({ processed: 0 }));
    const getStatus = vi.fn(async () => cleanStatus());

    const outcome = await runMaintenanceLoop({ runSeoBatch, runAggregatesBatch, getStatus, isPaused: () => paused });

    expect(outcome).toBe('paused');
    expect(runSeoBatch).toHaveBeenCalledTimes(1);
    expect(runAggregatesBatch).not.toHaveBeenCalled();
  });

  it('NÃO mostra sucesso ("done") enquanto aggregatePending > 0 — continua batches em vez de parar em processed=0', async () => {
    const runSeoBatch = vi.fn(async () => ({ processedCount: 0, errorCount: 0 }));
    // Cada batch "processa" 0 (tudo que resta é FAILED aguardando backoff),
    // mas a fila real (getStatus) só esvazia depois de 5 consultas.
    let statusCall = 0;
    const runAggregatesBatch = vi.fn(async () => ({ processed: 0 }));
    const getStatus = vi.fn(async () => {
      statusCall += 1;
      return statusCall < 5 ? { ...cleanStatus(), aggregatePending: 5 - statusCall } : cleanStatus();
    });

    const outcome = await runMaintenanceLoop({ runSeoBatch, runAggregatesBatch, getStatus, isPaused: () => false });

    expect(outcome).toBe('done');
    // Continuou chamando process-batch mesmo com processed=0 em toda chamada,
    // porque quem manda é getStatus().aggregatePending, não o retorno do batch.
    expect(runAggregatesBatch).toHaveBeenCalledTimes(5);
  });

  it('NÃO mostra sucesso quando restam jobs FAILED, mesmo com pending e processing zerados', async () => {
    const runSeoBatch = vi.fn(async () => ({ processedCount: 0, errorCount: 0 }));
    const runAggregatesBatch = vi.fn(async () => ({ processed: 0 }));
    const getStatus = vi.fn(async () => ({ ...cleanStatus(), aggregateFailed: 10 }));

    const outcome = await runMaintenanceLoop({ runSeoBatch, runAggregatesBatch, getStatus, isPaused: () => false });

    expect(outcome).toBe('incomplete');
    // pending=0 e processing=0 encerram o loop de tentativas — falhas não
    // são retentadas automaticamente em loop infinito, só reportadas.
    expect(runAggregatesBatch).toHaveBeenCalledTimes(1);
  });

  it('reporta progresso de aggregates a cada consulta de status', async () => {
    const runSeoBatch = vi.fn(async () => ({ processedCount: 0, errorCount: 0 }));
    const runAggregatesBatch = vi.fn(async () => ({ processed: 5 }));
    let statusCall = 0;
    const getStatus = vi.fn(async () => {
      statusCall += 1;
      return statusCall === 1 ? { ...cleanStatus(), aggregatePending: 1 } : cleanStatus();
    });
    const onAggregatesProgress = vi.fn();

    const outcome = await runMaintenanceLoop({
      runSeoBatch,
      runAggregatesBatch,
      getStatus,
      isPaused: () => false,
      onAggregatesProgress,
    });

    expect(outcome).toBe('done');
    expect(onAggregatesProgress).toHaveBeenCalledTimes(2);
    expect(onAggregatesProgress).toHaveBeenLastCalledWith(cleanStatus());
  });
});
