import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BasePlugin} from '@google/adk';
import {Agento11yClient} from '@grafana/agento11y';
import {createAgento11yGoogleAdkPlugin} from '@grafana/agento11y/google-adk';
import {metrics} from '@opentelemetry/api';
import {OTLPMetricExporter} from '@opentelemetry/exporter-metrics-otlp-http';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {resourceFromAttributes} from '@opentelemetry/resources';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type MetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {NodeTracerProvider} from '@opentelemetry/sdk-trace-node';
import {config as loadDotenv} from 'dotenv';
import {
  createGcpOtlpMetricReader,
  createGcpOtlpSpanProcessor,
  getGcpOtlpResource,
  isGcpOtlpTelemetryEnabled,
} from './otel-gcp-otlp.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(moduleDir, '..');
const envPath = join(repoRoot, '.env');

/** Load `.env` from the repo root with override so Cloud endpoints win. */
export function loadAgento11yEnv(): void {
  if (process.env.VITEST) {
    return;
  }
  if (existsSync(envPath)) {
    loadDotenv({path: envPath, override: true});
  }
}

loadAgento11yEnv();

const packageVersion = (() => {
  try {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    ) as {version?: string};
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

export const AGENTO11Y_AGENT_NAME = 'creative-director-ai';
export const AGENTO11Y_AGENT_VERSION = packageVersion;

type AdkPluginLike = {
  name: string;
  onUserMessageCallback?: (params: unknown) => Promise<unknown>;
  beforeRunCallback?: (params: unknown) => Promise<unknown>;
  onEventCallback?: (params: unknown) => Promise<unknown>;
  afterRunCallback?: (params: unknown) => Promise<void>;
  beforeAgentCallback?: (params: unknown) => Promise<unknown>;
  afterAgentCallback?: (params: unknown) => Promise<unknown>;
  beforeModelCallback?: (params: unknown) => Promise<unknown>;
  afterModelCallback?: (params: unknown) => Promise<unknown>;
  onModelErrorCallback?: (params: unknown) => Promise<unknown>;
  beforeToolCallback?: (params: unknown) => Promise<unknown>;
  afterToolCallback?: (params: unknown) => Promise<unknown>;
  onToolErrorCallback?: (params: unknown) => Promise<unknown>;
};

/**
 * ADK 2.x PluginManager calls every BasePlugin method. `@grafana/agento11y`
 * ships a duck-typed plugin for older ADK — wrap it so missing methods
 * (e.g. beforeToolSelection) fall through to BasePlugin no-ops.
 */
class Agento11yAdkPluginAdapter extends BasePlugin {
  private readonly inner: AdkPluginLike;

  constructor(inner: AdkPluginLike) {
    super(inner.name || 'agento11y_google_adk_plugin');
    this.inner = inner;
  }

  override async onUserMessageCallback(params: {
    invocationContext: unknown;
    userMessage: unknown;
  }): Promise<undefined> {
    await this.inner.onUserMessageCallback?.(params);
    return undefined;
  }

  override async beforeRunCallback(params: {
    invocationContext: unknown;
  }): Promise<undefined> {
    await this.inner.beforeRunCallback?.(params);
    return undefined;
  }

  override async onEventCallback(params: {
    invocationContext: unknown;
    event: unknown;
  }): Promise<undefined> {
    await this.inner.onEventCallback?.(params);
    return undefined;
  }

  override async afterRunCallback(params: {
    invocationContext: unknown;
  }): Promise<void> {
    await this.inner.afterRunCallback?.(params);
  }

  override async beforeAgentCallback(params: {
    agent: unknown;
    callbackContext: unknown;
  }): Promise<undefined> {
    await this.inner.beforeAgentCallback?.(params);
    return undefined;
  }

  override async afterAgentCallback(params: {
    agent: unknown;
    callbackContext: unknown;
  }): Promise<undefined> {
    await this.inner.afterAgentCallback?.(params);
    return undefined;
  }

  override async beforeModelCallback(params: {
    callbackContext: unknown;
    llmRequest: unknown;
  }): Promise<undefined> {
    await this.inner.beforeModelCallback?.(params);
    return undefined;
  }

  override async afterModelCallback(params: {
    callbackContext: unknown;
    llmResponse: unknown;
  }): Promise<undefined> {
    await this.inner.afterModelCallback?.(params);
    return undefined;
  }

  override async onModelErrorCallback(params: {
    callbackContext: unknown;
    llmRequest: unknown;
    error: Error;
  }): Promise<undefined> {
    await this.inner.onModelErrorCallback?.(params);
    return undefined;
  }

  override async beforeToolCallback(params: {
    tool: unknown;
    toolArgs: Record<string, unknown>;
    toolContext: unknown;
  }): Promise<undefined> {
    await this.inner.beforeToolCallback?.(params);
    return undefined;
  }

  override async afterToolCallback(params: {
    tool: unknown;
    toolArgs: Record<string, unknown>;
    toolContext: unknown;
    result: unknown;
  }): Promise<undefined> {
    await this.inner.afterToolCallback?.(params);
    return undefined;
  }

  override async onToolErrorCallback(params: {
    tool: unknown;
    toolArgs: Record<string, unknown>;
    toolContext: unknown;
    error: Error;
  }): Promise<undefined> {
    await this.inner.onToolErrorCallback?.(params);
    return undefined;
  }
}

export type Agento11yProviders = {
  tracerProvider: NodeTracerProvider;
  meterProvider: MeterProvider;
};

/**
 * Create OTel TracerProvider + MeterProvider before the Agent Observability client.
 * Grafana exporters read OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_HEADERS.
 * When GOOGLE_CLOUD_OTLP_TELEMETRY is set, also export to telemetry.googleapis.com
 * via standard OTLP (replaces deprecated --otel_to_cloud GCP exporters).
 */
export async function setupAgento11yOtel(): Promise<Agento11yProviders> {
  const baseResource = resourceFromAttributes({
    'service.name': AGENTO11Y_AGENT_NAME,
    'service.version': AGENTO11Y_AGENT_VERSION,
  });
  const resource = isGcpOtlpTelemetryEnabled()
    ? baseResource.merge(getGcpOtlpResource())
    : baseResource;

  const spanProcessors: SpanProcessor[] = [
    new BatchSpanProcessor(new OTLPTraceExporter()),
  ];
  const readers: MetricReader[] = [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
    }),
  ];

  if (isGcpOtlpTelemetryEnabled()) {
    spanProcessors.push(await createGcpOtlpSpanProcessor());
    readers.push(await createGcpOtlpMetricReader());
  }

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors,
  });
  tracerProvider.register();

  const meterProvider = new MeterProvider({
    resource,
    readers,
  });
  metrics.setGlobalMeterProvider(meterProvider);

  return {tracerProvider, meterProvider};
}

/**
 * GCP Telemetry API OTLP only (no Grafana Agent Observability).
 * Used when GOOGLE_CLOUD_OTLP_TELEMETRY is set but AGENTO11Y_* is incomplete.
 */
export async function setupGcpOtlpProvidersOnly(): Promise<Agento11yProviders> {
  const resource = resourceFromAttributes({
    'service.name': AGENTO11Y_AGENT_NAME,
    'service.version': AGENTO11Y_AGENT_VERSION,
  }).merge(getGcpOtlpResource());

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [await createGcpOtlpSpanProcessor()],
  });
  tracerProvider.register();

  const meterProvider = new MeterProvider({
    resource,
    readers: [await createGcpOtlpMetricReader()],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  return {tracerProvider, meterProvider};
}

export type Agento11yBootstrap = {
  client: Agento11yClient;
  plugin: BasePlugin;
  providers: Agento11yProviders;
  configured: boolean;
};

/** True when generation-ingest env is present (token not validated here). */
export function isAgento11yConfigured(): boolean {
  return Boolean(
    process.env.AGENTO11Y_ENDPOINT?.trim() &&
      process.env.AGENTO11Y_AUTH_TENANT_ID?.trim() &&
      process.env.AGENTO11Y_AUTH_TOKEN?.trim() &&
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() &&
      process.env.OTEL_EXPORTER_OTLP_HEADERS?.trim(),
  );
}

/**
 * Bootstrap Agent Observability: OTel providers, SDK client, Google ADK plugin.
 * Returns null when AGENTO11Y_* / OTEL_* env is incomplete.
 */
export async function createAgento11yBootstrap(): Promise<Agento11yBootstrap | null> {
  if (!isAgento11yConfigured()) {
    return null;
  }

  // Ensure Cloud HTTP + basic auth (SDK defaults are grpc/none → silent 401).
  process.env.AGENTO11Y_PROTOCOL ??= 'http';
  process.env.AGENTO11Y_AUTH_MODE ??= 'basic';

  const providers = await setupAgento11yOtel();
  const client = new Agento11yClient();
  const rawPlugin = createAgento11yGoogleAdkPlugin(client, {
    providerResolver: 'auto',
    agentName: AGENTO11Y_AGENT_NAME,
    agentVersion: AGENTO11Y_AGENT_VERSION,
  }) as unknown as AdkPluginLike;
  const plugin = new Agento11yAdkPluginAdapter(rawPlugin);

  return {client, plugin, providers, configured: true};
}

export async function shutdownAgento11y(
  bootstrap: Agento11yBootstrap | null,
): Promise<void> {
  if (!bootstrap) return;
  await bootstrap.client.shutdown();
  await bootstrap.providers.tracerProvider.shutdown();
  await bootstrap.providers.meterProvider.shutdown();
}
