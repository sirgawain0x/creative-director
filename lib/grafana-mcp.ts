/// <reference types="node" />
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
 * - `GRAFANA_URL` → hosted Cloud MCP + OAuth (X-Grafana-URL)
 * - `GRAFANA_MCP_URL` + optional `GRAFANA_SERVICE_ACCOUNT_TOKEN` → self-hosted / unattended
 */
export function resolveGrafanaMcpMode(): GrafanaMcpMode {
  // Allow Agent Observability verify runs to skip Cloud MCP (needs interactive OAuth).
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

export function isGrafanaMcpConfigured(): boolean {
  return resolveGrafanaMcpMode() !== 'off';
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
 * Build an MCPToolset for Grafana when env is configured; otherwise null.
 * Cloud mode uses interactive OAuth on first connect (local demo / playground).
 * Self-hosted mode should set GRAFANA_SERVICE_ACCOUNT_TOKEN for unattended Agent Runtime.
 */
export function createGrafanaMcpToolset(): MCPToolset | null {
  if (!isGrafanaMcpConfigured()) {
    return null;
  }

  const headers = buildGrafanaMcpHeaders();
  return new MCPToolset(
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
