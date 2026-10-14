import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const deploySh = readFileSync(join(root, 'scripts/deploy.sh'), 'utf8');
const deployCloudRunSh = readFileSync(
  join(root, 'scripts/deploy-cloudrun.sh'),
  'utf8',
);
const sharedEnvSh = readFileSync(
  join(root, 'scripts/lib/agento11y-deploy-env.sh'),
  'utf8',
);

describe('scripts/lib/agento11y-deploy-env.sh', () => {
  it('defines us-east-0 plain vars and secret refs without values', () => {
    expect(sharedEnvSh).toContain('AGENTO11Y_ENDPOINT=');
    expect(sharedEnvSh).toContain(
      'https://otlp-gateway-prod-us-east-0.grafana.net/otlp',
    );
    expect(sharedEnvSh).toContain(
      'AGENTO11Y_AUTH_TOKEN=${AGENTO11Y_AUTH_TOKEN_SECRET}:',
    );
    expect(sharedEnvSh).not.toMatch(/glc_[A-Za-z0-9]+/);
  });
});

describe('scripts/deploy.sh (Agent Engine)', () => {
  it('passes plain Agent Observability env vars and Secret Manager refs only', () => {
    expect(deploySh).toContain('agento11y-deploy-env.sh');
    expect(deploySh).toContain('--update-secrets');
    expect(deploySh).toContain('--update-env-vars');
    expect(deploySh).not.toMatch(/glc_[A-Za-z0-9]+/);
    expect(deploySh).not.toContain('Authorization=Basic ');
  });
});

describe('scripts/deploy-cloudrun.sh (production Cloud Run)', () => {
  it('updates creative-director with non-destructive gcloud flags', () => {
    expect(deployCloudRunSh).toContain('CLOUD_RUN_SERVICE:-creative-director');
    expect(deployCloudRunSh).toContain('CLOUD_RUN_REGION:-us-east1');
    expect(deployCloudRunSh).toContain('gcloud run services update');
    expect(deployCloudRunSh).toContain('--update-env-vars');
    expect(deployCloudRunSh).toContain('--update-secrets');
    expect(deployCloudRunSh).not.toContain('--set-env-vars');
    expect(deployCloudRunSh).not.toContain('--set-secrets');
    expect(deployCloudRunSh).toContain('secretmanager.secretAccessor');
    expect(deployCloudRunSh).not.toMatch(/glc_[A-Za-z0-9]+/);
  });
});
