import {afterEach, describe, expect, it, vi} from 'vitest';
import {MCPToolset} from '@google/adk';
import {
  GRAFANA_CLOUD_MCP_URL,
  GRAFANA_PIPELINE_TOOL_FILTER,
  buildGrafanaMcpHeaders,
  createGrafanaMcpToolset,
  isGrafanaMcpConfigured,
  normalizeGrafanaStackUrl,
  resolveGrafanaMcpEndpoint,
  resolveGrafanaMcpMode,
} from '../../lib/grafana-mcp.js';

describe('normalizeGrafanaStackUrl', () => {
  it('adds https and strips trailing slash', () => {
    expect(normalizeGrafanaStackUrl('mystack.grafana.net/')).toBe(
      'https://mystack.grafana.net',
    );
    expect(normalizeGrafanaStackUrl('https://mystack.grafana.net/')).toBe(
      'https://mystack.grafana.net',
    );
  });
});

describe('resolveGrafanaMcpMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off when no Grafana env is set', () => {
    vi.stubEnv('GRAFANA_URL', '');
    vi.stubEnv('GRAFANA_MCP_URL', '');
    expect(resolveGrafanaMcpMode()).toBe('off');
    expect(isGrafanaMcpConfigured()).toBe(false);
  });

  it('uses cloud mode for GRAFANA_URL', () => {
    vi.stubEnv('GRAFANA_URL', 'https://mystack.grafana.net');
    vi.stubEnv('GRAFANA_MCP_URL', '');
    expect(resolveGrafanaMcpMode()).toBe('cloud');
    expect(isGrafanaMcpConfigured()).toBe(true);
    expect(resolveGrafanaMcpEndpoint()).toBe(GRAFANA_CLOUD_MCP_URL);
  });

  it('prefers self_hosted when GRAFANA_MCP_URL is set', () => {
    vi.stubEnv('GRAFANA_URL', 'https://mystack.grafana.net');
    vi.stubEnv('GRAFANA_MCP_URL', 'http://127.0.0.1:8000/mcp');
    expect(resolveGrafanaMcpMode()).toBe('self_hosted');
    expect(resolveGrafanaMcpEndpoint()).toBe('http://127.0.0.1:8000/mcp');
  });
});

describe('buildGrafanaMcpHeaders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets X-Grafana-URL for cloud mode', () => {
    vi.stubEnv('GRAFANA_URL', 'mystack.grafana.net');
    vi.stubEnv('GRAFANA_MCP_URL', '');
    vi.stubEnv('GRAFANA_SERVICE_ACCOUNT_TOKEN', '');
    expect(buildGrafanaMcpHeaders()).toEqual({
      'X-Grafana-URL': 'https://mystack.grafana.net',
    });
  });

  it('sets Authorization bearer for service account token', () => {
    vi.stubEnv('GRAFANA_MCP_URL', 'http://127.0.0.1:8000/mcp');
    vi.stubEnv('GRAFANA_SERVICE_ACCOUNT_TOKEN', 'glsa_test');
    expect(buildGrafanaMcpHeaders()).toEqual({
      Authorization: 'Bearer glsa_test',
    });
  });
});

describe('GRAFANA_PIPELINE_TOOL_FILTER', () => {
  it('includes Loki, Tempo, and Prometheus query tools', () => {
    expect(GRAFANA_PIPELINE_TOOL_FILTER).toContain('query_loki_logs');
    expect(GRAFANA_PIPELINE_TOOL_FILTER).toContain('tempo_get-trace');
    expect(GRAFANA_PIPELINE_TOOL_FILTER).toContain('query_prometheus');
  });
});

describe('createGrafanaMcpToolset', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when Grafana is not configured', () => {
    vi.stubEnv('GRAFANA_URL', '');
    vi.stubEnv('GRAFANA_MCP_URL', '');
    expect(createGrafanaMcpToolset()).toBeNull();
  });

  it('returns an MCPToolset when GRAFANA_URL is set', () => {
    vi.stubEnv('GRAFANA_URL', 'https://mystack.grafana.net');
    vi.stubEnv('GRAFANA_MCP_URL', '');
    expect(createGrafanaMcpToolset()).toBeInstanceOf(MCPToolset);
  });
});
