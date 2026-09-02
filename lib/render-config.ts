import {isVertexGenerativeConfigured} from './vertex-generative.js';

/** True when real Vertex + GCS render pipeline should run (vs mock stubs). */
export function isProductionRenderConfigured(): boolean {
  if (process.env.RENDERS_GCS_BUCKET?.trim()) {
    return isVertexGenerativeConfigured();
  }
  if (process.env.CREATIVE_DIRECTOR_MODE?.toLowerCase() === 'production') {
    return isVertexGenerativeConfigured();
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
