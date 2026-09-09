import {afterEach, describe, expect, it, vi} from 'vitest';
import {isGcpOtlpTelemetryEnabled} from '../../lib/otel-gcp-otlp.js';

describe('isGcpOtlpTelemetryEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when unset', () => {
    vi.stubEnv('GOOGLE_CLOUD_OTLP_TELEMETRY', '');
    expect(isGcpOtlpTelemetryEnabled()).toBe(false);
  });

  it('is true for 1 / true / yes', () => {
    vi.stubEnv('GOOGLE_CLOUD_OTLP_TELEMETRY', '1');
    expect(isGcpOtlpTelemetryEnabled()).toBe(true);
    vi.stubEnv('GOOGLE_CLOUD_OTLP_TELEMETRY', 'true');
    expect(isGcpOtlpTelemetryEnabled()).toBe(true);
    vi.stubEnv('GOOGLE_CLOUD_OTLP_TELEMETRY', 'YES');
    expect(isGcpOtlpTelemetryEnabled()).toBe(true);
  });
});
