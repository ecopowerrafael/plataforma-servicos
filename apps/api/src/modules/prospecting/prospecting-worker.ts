/**
 * Interface abstrata do ProspectingWorker.
 * Permite mock para testes e injeção de dependência.
 */

export interface ProspectingWorkerRunResult {
  campaignsChecked: number;
  leadsClaimed: number;
  sent: number;
  dryRun: number;
  retried: number;
  failed: number;
  skipped: number;
}

export interface ProspectingWorker {
  /**
   * Executa um ciclo único de processamento de leads elegíveis.
   * Retorna estatísticas do ciclo.
   */
  runOnce(): Promise<ProspectingWorkerRunResult>;

  /**
   * Inicia o scheduler (if enabled).
   */
  start(): void;

  /**
   * Para o scheduler graciosamente.
   */
  stop(): Promise<void>;
}
