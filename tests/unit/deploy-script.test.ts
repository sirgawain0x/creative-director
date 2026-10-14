import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const deploySh = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../scripts/deploy.sh'),
  'utf8',
);

describe('scripts/deploy.sh', () => {
  it('passes plain Agent Observability env vars and Secret Manager refs only', () => {
    expect(deploySh).toContain('AGENTO11Y_ENDPOINT=');
    expect(deploySh).toContain('OTEL_EXPORTER_OTLP_PROTOCOL=');
    expect(deploySh).toContain('--update-secrets');
    expect(deploySh).toContain(
      'AGENTO11Y_AUTH_TOKEN=${AGENTO11Y_AUTH_TOKEN_SECRET}:',
    );
    expect(deploySh).toContain(
      'OTEL_EXPORTER_OTLP_HEADERS=${OTEL_EXPORTER_OTLP_HEADERS_SECRET}:',
    );
    expect(deploySh).not.toMatch(/glc_[A-Za-z0-9]+/);
    expect(deploySh).not.toContain('Authorization=Basic ');
  });

  it('defaults OTLP gateway to us-east-0', () => {
    expect(deploySh).toContain(
      'https://otlp-gateway-prod-us-east-0.grafana.net/otlp',
    );
  });
});
