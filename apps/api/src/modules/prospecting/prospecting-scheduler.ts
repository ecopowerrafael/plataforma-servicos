import { type ProspectingWorker } from './prospecting-worker.js';

/**
 * Scheduler que acorda periodicamente o ProspectingWorker.
 * Evita execução concorrente do mesmo processo.
 */
export class ProspectingScheduler {
  private running = false;

  public constructor(private readonly worker: ProspectingWorker) {}

  public start(): void {
    this.worker.start();
  }

  public async stop(): Promise<void> {
    await this.worker.stop();
  }

  /**
   * Executa runOnce mas evita concorrência.
   * Se já está rodando, retorna sem fazer nada.
   */
  public async runOnceSafe(): Promise<any> {
    if (this.running) {
      console.log('[ProspectingScheduler] runOnce already running, skipping');
      return { skipped: true };
    }

    this.running = true;
    try {
      return await this.worker.runOnce();
    } finally {
      this.running = false;
    }
  }
}
