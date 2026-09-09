#!/usr/bin/env node
/**
 * Verify Grafana Cloud MCP is configured for local activation.
 * Loads .env if present; does not print secrets.
 */
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(resolve(process.cwd(), '.env'));

const grafanaUrl = process.env.GRAFANA_URL?.trim() || '';
const mcpUrl = process.env.GRAFANA_MCP_URL?.trim() || '';
const hasToken = Boolean(process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN?.trim());
const mode = mcpUrl ? 'self_hosted' : grafanaUrl ? 'cloud' : 'off';
const endpoint =
  mode === 'self_hosted'
    ? mcpUrl
    : process.env.GRAFANA_CLOUD_MCP_URL?.trim() ||
      'https://mcp.grafana.com/mcp';

const ok = mode !== 'off';
console.log(
  JSON.stringify(
    {
      ok,
      mode,
      endpoint,
      grafanaUrlSet: Boolean(grafanaUrl),
      grafanaUrlHost: grafanaUrl
        ? new URL(
            /^https?:\/\//i.test(grafanaUrl)
              ? grafanaUrl
              : `https://${grafanaUrl}`,
          ).host
        : null,
      serviceAccountTokenSet: hasToken,
      next:
        mode === 'cloud'
          ? 'Run npm run adk:web and complete browser OAuth on first grafana_* tool use'
          : mode === 'self_hosted'
            ? hasToken
              ? 'Ready for Agent Runtime env update (see README Agent Runtime Grafana)'
              : 'Set GRAFANA_SERVICE_ACCOUNT_TOKEN for unattended MCP'
            : 'Set GRAFANA_URL in .env',
    },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
