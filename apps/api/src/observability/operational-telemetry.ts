export interface RequestObservation {
  statusCode: number;
  durationMilliseconds: number;
  slow: boolean;
  failed: boolean;
}

export class OperationalTelemetry {
  private readonly startedAt = Date.now();
  private inFlightRequests = 0;
  private completedRequests = 0;
  private failedRequests = 0;
  private slowRequests = 0;
  private durationMillisecondsTotal = 0;
  private readonly responsesByStatus = new Map<number, number>();

  public constructor(private readonly slowRequestThresholdMilliseconds: number) {}

  public requestStarted(): void {
    this.inFlightRequests += 1;
  }

  public requestCompleted(statusCode: number, durationMilliseconds: number): RequestObservation {
    this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
    this.completedRequests += 1;
    this.durationMillisecondsTotal += durationMilliseconds;
    this.responsesByStatus.set(statusCode, (this.responsesByStatus.get(statusCode) ?? 0) + 1);

    const failed = statusCode >= 500;
    const slow = durationMilliseconds >= this.slowRequestThresholdMilliseconds;
    if (failed) this.failedRequests += 1;
    if (slow) this.slowRequests += 1;

    return { statusCode, durationMilliseconds, slow, failed };
  }

  public prometheus(): string {
    const lines = [
      '# HELP agendei_process_uptime_seconds Uptime do processo da API em segundos.',
      '# TYPE agendei_process_uptime_seconds gauge',
      `agendei_process_uptime_seconds ${String((Date.now() - this.startedAt) / 1_000)}`,
      '# HELP agendei_http_requests_in_flight Requisições HTTP em andamento.',
      '# TYPE agendei_http_requests_in_flight gauge',
      `agendei_http_requests_in_flight ${String(this.inFlightRequests)}`,
      '# HELP agendei_http_requests_total Requisições HTTP concluídas por status.',
      '# TYPE agendei_http_requests_total counter',
      ...[...this.responsesByStatus.entries()]
        .sort(([left], [right]) => left - right)
        .map(
          ([statusCode, count]) =>
            `agendei_http_requests_total{status_code="${String(statusCode)}"} ${String(count)}`,
        ),
      '# HELP agendei_http_request_duration_milliseconds_total Soma das durações das requisições HTTP.',
      '# TYPE agendei_http_request_duration_milliseconds_total counter',
      `agendei_http_request_duration_milliseconds_total ${String(this.durationMillisecondsTotal)}`,
      '# HELP agendei_http_requests_failed_total Respostas HTTP 5xx.',
      '# TYPE agendei_http_requests_failed_total counter',
      `agendei_http_requests_failed_total ${String(this.failedRequests)}`,
      '# HELP agendei_http_requests_slow_total Respostas acima do limite de latência configurado.',
      '# TYPE agendei_http_requests_slow_total counter',
      `agendei_http_requests_slow_total ${String(this.slowRequests)}`,
      '# HELP agendei_http_requests_completed_total Requisições HTTP concluídas.',
      '# TYPE agendei_http_requests_completed_total counter',
      `agendei_http_requests_completed_total ${String(this.completedRequests)}`,
    ];

    return `${lines.join('\n')}\n`;
  }
}
