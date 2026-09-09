/// <reference types="node" />
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {MCPToolset} from '@google/adk';

/** Default hosted Grafana Cloud MCP endpoint (Streamable HTTP). */
export const GRAFANA_CLOUD_MCP_URL = 'https://mcp.grafana.com/mcp';

/**
 * Tools most useful for music-video render pipeline ops.
 * Full Cloud MCP exposes 60+; filter keeps the director focused.
 */
export const GRAFANA_PIPELINE_TOOL_FILTER = [
  'search_dashboards',
  'generate_deeplink',
  'list_datasources',
  'query_prometheus',
  'list_prometheus_metric_names',
  'query_loki_logs',
  'list_loki_label_names',
  'list_loki_label_values',
  'tempo_traceql-search',
  'tempo_get-trace',
  'get_annotations',
  'create_annotation',
  'list_incidents',
  'get_incident',
  'alerting_manage_rules',
] as const;

export type GrafanaMcpMode = 'cloud' | 'self_hosted' | 'off';

/** Normalize a Grafana stack URL to https://<stack>.grafana.net (no trailing slash). */
export function normalizeGrafanaStackUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

/**
 * Resolve how Grafana MCP should connect.
 * - `GRAFANA_URL` → hosted Cloud MCP (X-Grafana-URL)
 * - `GRAFANA_MCP_URL` → self-hosted / unattended
 *
 * ADK's Streamable HTTP transport does not perform interactive OAuth; a bearer
 * token (`GRAFANA_SERVICE_ACCOUNT_TOKEN`) is required before tools are enabled.
 */
export function resolveGrafanaMcpMode(): GrafanaMcpMode {
  // Allow Agent Observability verify runs to skip Cloud MCP.
  if (process.env.AGENTO11Y_SKIP_GRAFANA_MCP?.trim() === '1') {
    return 'off';
  }
  if (process.env.GRAFANA_MCP_URL?.trim()) {
    return 'self_hosted';
  }
  if (process.env.GRAFANA_URL?.trim()) {
    return 'cloud';
  }
  return 'off';
}

export function hasGrafanaMcpAuth(): boolean {
  return Boolean(process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN?.trim());
}

/**
 * True when Grafana MCP env is set AND a service-account (or equivalent)
 * bearer token is present. Without a token, enabling the toolset only produces
 * 401s on every agent turn.
 */
export function isGrafanaMcpConfigured(): boolean {
  return resolveGrafanaMcpMode() !== 'off' && hasGrafanaMcpAuth();
}

/** Whether ADK can createRequire the MCP SDK peer (used by MCPToolset). */
export function isMcpSdkAvailable(): boolean {
  try {
    const require = createRequire(fileURLToPath(import.meta.url));
    require.resolve('@modelcontextprotocol/sdk/client/index.js');
    require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js');
    return true;
  } catch {
    return false;
  }
}

export function buildGrafanaMcpHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const mode = resolveGrafanaMcpMode();

  if (mode === 'cloud') {
    const stack = normalizeGrafanaStackUrl(process.env.GRAFANA_URL ?? '');
    if (stack) {
      headers['X-Grafana-URL'] = stack;
    }
  }

  const token = process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export function resolveGrafanaMcpEndpoint(): string {
  const mode = resolveGrafanaMcpMode();
  if (mode === 'self_hosted') {
    return process.env.GRAFANA_MCP_URL!.trim();
  }
  if (mode === 'cloud') {
    return (
      process.env.GRAFANA_CLOUD_MCP_URL?.trim() || GRAFANA_CLOUD_MCP_URL
    );
  }
  return GRAFANA_CLOUD_MCP_URL;
}

/**
 * MCPToolset that never fails the agent turn if Grafana MCP is unreachable
 * or the optional peer fails to load inside ADK's temp bundle.
 */
class ResilientGrafanaMcpToolset extends MCPToolset {
  override async getTools(
    context?: Parameters<MCPToolset['getTools']>[0],
  ): ReturnType<MCPToolset['getTools']> {
    try {
      return await super.getTools(context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[grafana-mcp] Tools unavailable (agent continues without them): ${message}`,
      );
      return [];
    }
  }
}

/**
 * Build an MCPToolset for Grafana when endpoint + bearer token are set.
 * Returns null when auth is missing or @modelcontextprotocol/sdk cannot load.
 */
export function createGrafanaMcpToolset(): MCPToolset | null {
  if (!isGrafanaMcpConfigured()) {
    const mode = resolveGrafanaMcpMode();
    if (mode !== 'off' && !hasGrafanaMcpAuth()) {
      console.warn(
        '[grafana-mcp] Skipping Grafana MCP: set GRAFANA_SERVICE_ACCOUNT_TOKEN (ADK has no interactive OAuth).',
      );
    }
    return null;
  }

  if (!isMcpSdkAvailable()) {
    console.warn(
      '[grafana-mcp] Skipping Grafana MCP: optional peer @modelcontextprotocol/sdk is not resolvable. Run: npm install @modelcontextprotocol/sdk',
    );
    return null;
  }

  const headers = buildGrafanaMcpHeaders();
  return new ResilientGrafanaMcpToolset(
    {
      type: 'StreamableHTTPConnectionParams',
      url: resolveGrafanaMcpEndpoint(),
      transportOptions: {
        requestInit: {
          headers,
        },
      },
    },
    [...GRAFANA_PIPELINE_TOOL_FILTER],
    'grafana',
  );
}
