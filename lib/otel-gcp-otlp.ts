/**
 * Google Cloud Telemetry API via standard OTLP exporters.
 *
 * Replaces deprecated `@google-cloud/opentelemetry-cloud-trace-exporter` /
 * `cloud-monitoring-exporter` (and ADK `--otel_to_cloud`). See:
 * https://github.com/GoogleCloudPlatform/opentelemetry-operations-js/blob/main/MIGRATION.md
 */
import {GoogleAuth, type AuthClient} from 'google-auth-library';
import {OTLPMetricExporter} from '@opentelemetry/exporter-metrics-otlp-http';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {gcpDetector} from '@opentelemetry/resource-detector-gcp';
import {detectResources, type Resource} from '@opentelemetry/resources';
import {
  PeriodicExportingMetricReader,
  type MetricReader,
} from '@opentelemetry/sdk-metrics';
import {BatchSpanProcessor, type SpanProcessor} from '@opentelemetry/sdk-trace-base';

/** Telemetry API OTLP base (HTTP). Paths /v1/traces and /v1/metrics are appended by exporters. */
export const GCP_TELEMETRY_OTLP_ENDPOINT = 'https://telemetry.googleapis.com';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/** Opt-in: set GOOGLE_CLOUD_OTLP_TELEMETRY=1|true to export to Cloud Trace / GMP via OTLP. */
export function isGcpOtlpTelemetryEnabled(): boolean {
  const v = process.env.GOOGLE_CLOUD_OTLP_TELEMETRY?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

async function getAuthenticatedClient(): Promise<AuthClient> {
  const auth = new GoogleAuth({scopes: CLOUD_PLATFORM_SCOPE});
  return auth.getClient();
}

async function gcpOtlpHeaders(
  client: AuthClient,
): Promise<Record<string, string>> {
  const raw = await client.getRequestHeaders();
  return Object.fromEntries(raw.entries());
}

/**
 * Span processor exporting to Google Cloud Telemetry API (Cloud Trace) over OTLP/HTTP.
 */
export async function createGcpOtlpSpanProcessor(): Promise<SpanProcessor> {
  const client = await getAuthenticatedClient();
  return new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: `${GCP_TELEMETRY_OTLP_ENDPOINT}/v1/traces`,
      headers: async () => gcpOtlpHeaders(client),
    }),
  );
}

/**
 * Metric reader exporting to Google Cloud Telemetry API (GMP) over OTLP/HTTP.
 */
export async function createGcpOtlpMetricReader(): Promise<MetricReader> {
  const client = await getAuthenticatedClient();
  return new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${GCP_TELEMETRY_OTLP_ENDPOINT}/v1/metrics`,
      headers: async () => gcpOtlpHeaders(client),
    }),
    exportIntervalMillis: 5_000,
  });
}

/** Resource with GCP detectors (project id, etc.). */
export function getGcpOtlpResource(): Resource {
  return detectResources({detectors: [gcpDetector]});
}
