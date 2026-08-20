import { describe, expect, it, vi } from 'vitest';

import { runMaintenanceLoop } from './directory-maintenance-runner.js';

describe('runMaintenanceLoop', () => {
  it('processa SEO sequencialmente até processedCount = 0, depois aggregates até processed = 0', async () => {
    const callOrder: string[] = [];
    let seoCall = 0;
    const runSeoBatch = vi.fn(async () => {
      callOrder.push(`seo-${String(seoCall)}`);
      seoCall += 1;
      // 3 batches com trabalho, o 4º já vazio.
      return seoCall <= 3 ? { processedCount: 200, errorCount: 0 } : { processedCount: 0, errorCount: 0 };
    });
    let aggCall = 0;
    const runAggregatesBatch = vi.fn(async () => {
      callOrder.push(`agg-${String(aggCall)}`);
      aggCall += 1;
      return aggCall <= 2 ? { processed: 10 } : { processed: 0 };
    });

    const outcome = await runMaintenanceLoop({
      runSeoBatch,
      runAggregatesBatch,
      isPaused: () => false,
    });

    expect(outcome).toBe('done');
    expect(runSeoBatch).toHaveBeenCalledTimes(4);
    expect(runAggregatesBatch).toHaveBeenCalledTimes(3);
    // Sequencial: todo batch de agregados vem depois do último batch de SEO.
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

    await runMaintenanceLoop({ runSeoBatch, runAggregatesBatch, isPaused: () => false });

    expect(maxConcurrent).toBe(1);
  });

  it('pausa antes da próxima chamada de SEO, sem cancelar a chamada em andamento', async () => {
    let calls = 0;
    let paused = false;
    const runSeoBatch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) paused = true; // pausa é sinalizada durante a 1ª chamada
      return { processedCount: 100, errorCount: 0 }; // a 1ª chamada sempre completa normalmente
    });
    const runAggregatesBatch = vi.fn(async () => ({ processed: 0 }));

    const outcome = await runMaintenanceLoop({
      runSeoBatch,
      runAggregatesBatch,
      isPaused: () => paused,
    });

    expect(outcome).toBe('paused');
    // A 1ª chamada (já em andamento quando a pausa foi sinalizada) completou normalmente...
    expect(runSeoBatch).toHaveBeenCalledTimes(1);
    // ...mas a 2ª nunca foi disparada, e aggregates nunca começou.
    expect(runAggregatesBatch).not.toHaveBeenCalled();
  });

  it('pausa entre a fase de SEO e a fase de aggregates também impede o início dos aggregates', async () => {
    const runSeoBatch = vi.fn(async () => ({ processedCount: 0, errorCount: 0 }));
    const runAggregatesBatch = vi.fn(async () => ({ processed: 10 }));

    const outcome = await runMaintenanceLoop({
      runSeoBatch,
      runAggregatesBatch,
      isPaused: () => true,
    });

    expect(outcome).toBe('paused');
    expect(runAggregatesBatch).not.toHaveBeenCalled();
  });

  it('reporta progresso a cada batch de SEO e sinaliza o início da fase de aggregates', async () => {
    let calls = 0;
    const runSeoBatch = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? { processedCount: 200, errorCount: 1 } : { processedCount: 0, errorCount: 0 };
    });
    const runAggregatesBatch = vi.fn(async () => ({ processed: 0 }));
    const onSeoProgress = vi.fn();
    const onAggregatesStart = vi.fn();

    await runMaintenanceLoop({
      runSeoBatch,
      runAggregatesBatch,
      isPaused: () => false,
      onSeoProgress,
      onAggregatesStart,
    });

    expect(onSeoProgress).toHaveBeenCalledWith({ processed: 200, errors: 1 });
    expect(onAggregatesStart).toHaveBeenCalledTimes(1);
  });
});
