import { describe, expect, it } from 'vitest';

import { OperationalTelemetry } from './operational-telemetry.js';

describe('OperationalTelemetry', () => {
  it('contabiliza respostas, falhas e respostas lentas sem criar labels de rota', () => {
    const telemetry = new OperationalTelemetry(100);

    telemetry.requestStarted();
    const slow = telemetry.requestCompleted(200, 125);
    telemetry.requestStarted();
    const failed = telemetry.requestCompleted(503, 20);

    expect(slow).toMatchObject({ slow: true, failed: false });
    expect(failed).toMatchObject({ slow: false, failed: true });
    expect(telemetry.prometheus()).toContain('agendei_http_requests_total{status_code="200"} 1');
    expect(telemetry.prometheus()).toContain('agendei_http_requests_total{status_code="503"} 1');
    expect(telemetry.prometheus()).toContain('agendei_http_requests_failed_total 1');
    expect(telemetry.prometheus()).toContain('agendei_http_requests_slow_total 1');
    expect(telemetry.prometheus()).not.toContain('route=');
  });
});
