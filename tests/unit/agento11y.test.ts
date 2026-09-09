import {afterEach, describe, expect, it, vi} from 'vitest';
import {isAgento11yConfigured} from '../../lib/agento11y.js';

describe('isAgento11yConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when required env is missing', () => {
    vi.stubEnv('AGENTO11Y_ENDPOINT', '');
    vi.stubEnv('AGENTO11Y_AUTH_TENANT_ID', '');
    vi.stubEnv('AGENTO11Y_AUTH_TOKEN', '');
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    vi.stubEnv('OTEL_EXPORTER_OTLP_HEADERS', '');
    expect(isAgento11yConfigured()).toBe(false);
  });

  it('is true when ingest and OTLP env are set', () => {
    vi.stubEnv(
      'AGENTO11Y_ENDPOINT',
      'https://agento11y-prod-us-east-0.grafana.net',
    );
    vi.stubEnv('AGENTO11Y_AUTH_TENANT_ID', '829818');
    vi.stubEnv('AGENTO11Y_AUTH_TOKEN', 'glc_test');
    vi.stubEnv(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'https://otlp-gateway-prod-us-east-2.grafana.net/otlp',
    );
    vi.stubEnv('OTEL_EXPORTER_OTLP_HEADERS', 'Authorization=Basic dGVzdA==');
    expect(isAgento11yConfigured()).toBe(true);
  });
});
