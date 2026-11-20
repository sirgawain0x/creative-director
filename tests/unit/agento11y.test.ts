import {BaseTool, Context, PluginManager} from '@google/adk';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  Agento11yAdkPluginAdapter,
  DEFAULT_OTEL_EXPORTER_OTLP_ENDPOINT,
  applyAgento11yDefaults,
  getAgento11yExporterGaps,
  isAgento11yConfigured,
  logAgento11yExporterWarning,
} from '../../lib/agento11y.js';

describe('applyAgento11yDefaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses us-east-0 Grafana endpoints when unset', () => {
    vi.unstubAllEnvs();
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.AGENTO11Y_ENDPOINT;
    applyAgento11yDefaults();
    expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(
      DEFAULT_OTEL_EXPORTER_OTLP_ENDPOINT,
    );
    expect(process.env.AGENTO11Y_ENDPOINT).toBe(
      'https://agento11y-prod-us-east-0.grafana.net',
    );
    expect(process.env.OTEL_EXPORTER_OTLP_PROTOCOL).toBe('http/protobuf');
    expect(process.env.OTEL_SERVICE_NAME).toBe('creative-director-ai');
  });
});

describe('getAgento11yExporterGaps', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports missing auth secrets only when endpoint defaults are present', () => {
    applyAgento11yDefaults();
    vi.stubEnv('AGENTO11Y_AUTH_TOKEN', '');
    vi.stubEnv('OTEL_EXPORTER_OTLP_HEADERS', '');
    expect(getAgento11yExporterGaps()).toEqual(['auth_token', 'otlp_headers']);
  });

  it('reports missing endpoint when cleared after defaults', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    expect(getAgento11yExporterGaps()).toContain('otel_endpoint');
  });
});

describe('logAgento11yExporterWarning', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('warns without printing secret values', () => {
    vi.stubEnv('VITEST', '');
    applyAgento11yDefaults();
    vi.stubEnv('AGENTO11Y_AUTH_TOKEN', '');
    vi.stubEnv('OTEL_EXPORTER_OTLP_HEADERS', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logAgento11yExporterWarning();
    expect(warn).toHaveBeenCalledOnce();
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('[agento11y]');
    expect(message).not.toMatch(/glc_|Authorization=Basic/);
  });
});

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
      'https://otlp-gateway-prod-us-east-0.grafana.net/otlp',
    );
    vi.stubEnv('OTEL_EXPORTER_OTLP_HEADERS', 'Authorization=Basic dGVzdA==');
    expect(isAgento11yConfigured()).toBe(true);
  });
});

describe('Agento11yAdkPluginAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('swallows echoed tool error rethrown by agento11y without warning', async () => {
    const toolError = new Error(
      "Error in tool 'assemble_and_sync_timeline': Missing or invalid Authorization Bearer token",
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = new Agento11yAdkPluginAdapter({
      name: 'agento11y_google_adk_plugin',
      onToolErrorCallback: async (params) => {
        throw (params as {error: Error}).error;
      },
    });

    await expect(
      adapter.onToolErrorCallback({
        tool: {name: 'assemble_and_sync_timeline'},
        toolArgs: {},
        toolContext: {},
        error: toolError,
      }),
    ).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and resolves undefined when onToolErrorCallback throws an unrelated plugin error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = new Agento11yAdkPluginAdapter({
      name: 'agento11y_google_adk_plugin',
      onToolErrorCallback: async () => {
        throw new Error('OTLP span exporter failure');
      },
    });

    await expect(
      adapter.onToolErrorCallback({
        tool: {name: 'assemble_and_sync_timeline'},
        toolArgs: {},
        toolContext: {},
        error: new Error('original tool failure'),
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      '[agento11y] onToolErrorCallback failed:',
    );
    expect(String(warn.mock.calls[0]?.[1])).toContain(
      'OTLP span exporter failure',
    );
  });

  it('catches errors from onModelErrorCallback, beforeToolCallback, and afterToolCallback', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const modelError = new Error('vertex 503');
    const adapter = new Agento11yAdkPluginAdapter({
      name: 'agento11y_google_adk_plugin',
      onModelErrorCallback: async (params) => {
        throw (params as {error: Error}).error;
      },
      beforeToolCallback: async () => {
        throw new Error('beforeTool boom');
      },
      afterToolCallback: async () => {
        throw new Error('afterTool boom');
      },
    });

    await expect(
      adapter.onModelErrorCallback({
        callbackContext: {},
        llmRequest: {},
        error: modelError,
      }),
    ).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();

    const unrelatedAdapter = new Agento11yAdkPluginAdapter({
      name: 'agento11y_google_adk_plugin',
      onModelErrorCallback: async () => {
        throw new Error('model telemetry boom');
      },
    });
    await expect(
      unrelatedAdapter.onModelErrorCallback({
        callbackContext: {},
        llmRequest: {},
        error: modelError,
      }),
    ).resolves.toBeUndefined();

    await expect(
      adapter.beforeToolCallback({
        tool: {name: 't'},
        toolArgs: {},
        toolContext: {},
      }),
    ).resolves.toBeUndefined();
    await expect(
      adapter.afterToolCallback({
        tool: {name: 't'},
        toolArgs: {},
        toolContext: {},
        result: {},
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('lets ADK PluginManager.runOnToolErrorCallback resolve cleanly when inner throws', async () => {
    const toolError = new Error(
      "Error in tool 'sign_c2pa_manifest': Missing or invalid Authorization Bearer token",
    );
    const adapter = new Agento11yAdkPluginAdapter({
      name: 'agento11y_google_adk_plugin',
      onToolErrorCallback: async (params) => {
        throw (params as {error: Error}).error;
      },
    });
    const pluginManager = new PluginManager([adapter]);

    await expect(
      pluginManager.runOnToolErrorCallback({
        tool: {name: 'sign_c2pa_manifest'} as unknown as BaseTool,
        toolArgs: {},
        toolContext: {} as unknown as Context,
        error: toolError,
      }),
    ).resolves.toBeUndefined();
  });
});
