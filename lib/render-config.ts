import {isPixelsGenerateConfigured} from './pixels-generate-client.js';
import {isVertexGenerativeConfigured} from './vertex-generative.js';

/** True when Pixels Generate quote/render APIs are reachable (Phase 2). */
export {isPixelsGenerateConfigured};

/** True when legacy direct Vertex + GCS render pipeline should run. */
export function isLegacyVertexRenderConfigured(): boolean {
  if (!isVertexGenerativeConfigured()) return false;
  return Boolean(process.env.RENDERS_GCS_BUCKET?.trim());
}

/** True when any real render path is available (Pixels Generate or legacy Vertex). */
export function isProductionRenderConfigured(): boolean {
  if (isPixelsGenerateConfigured()) return true;
  if (process.env.RENDERS_GCS_BUCKET?.trim()) {
    return isVertexGenerativeConfigured();
  }
  if (process.env.CREATIVE_DIRECTOR_MODE?.toLowerCase() === 'production') {
    return isLegacyVertexRenderConfigured();
  }
  return false;
}

/** True when Pixels headless assembly is configured (Phase 2). */
export function isHeadlessAssemblyConfigured(): boolean {
  return Boolean(process.env.PIXELS_HEADLESS_URL?.trim());
}

/** True when GCS provenance sidecars can be written (Phase 3A/3B). */
export function isProvenanceConfigured(): boolean {
  return isProductionRenderConfigured();
}

/** True when headless workspace sync to GCS is available (Week 2). */
export function isWorkspaceSyncConfigured(): boolean {
  return isHeadlessAssemblyConfigured() && isProductionRenderConfigured();
}

/** True when headless can cryptographically embed C2PA (Week 3). */
export function isC2paEmbedConfigured(): boolean {
  const enabled = process.env.C2PA_HEADLESS_EMBED?.toLowerCase();
  if (enabled === '0' || enabled === 'false' || enabled === 'off') {
    return false;
  }
  return isHeadlessAssemblyConfigured() && isProductionRenderConfigured();
}
