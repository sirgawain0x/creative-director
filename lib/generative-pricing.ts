/**
 * Minimal Veo duration / quality helpers for Vertex video generation.
 */

export type VeoTier = 'standard' | 'fast' | 'lite';
export type VeoQuality = '720p' | '1080p' | '4K';

export const FLOW_ALLOWED_DURATIONS = [4, 6, 8] as const;
export type FlowDurationSec = (typeof FLOW_ALLOWED_DURATIONS)[number];

export function clampFlowDuration(seconds: number): FlowDurationSec {
  if (!Number.isFinite(seconds)) return 8;
  const rounded = Math.round(seconds);
  if (FLOW_ALLOWED_DURATIONS.includes(rounded as FlowDurationSec)) {
    return rounded as FlowDurationSec;
  }
  return FLOW_ALLOWED_DURATIONS.reduce((best, d) =>
    Math.abs(d - rounded) < Math.abs(best - rounded) ? d : best,
  );
}

export function normalizeVeoQuality(quality: string, tier: VeoTier): VeoQuality {
  const q =
    quality === '4k' || quality === '4K'
      ? '4K'
      : quality === '1080p'
        ? '1080p'
        : '720p';
  if (tier === 'lite' && q === '4K') return '1080p';
  return q;
}

export function veoModelId(tier: VeoTier): string {
  if (tier === 'fast') return 'veo-3.1-fast-generate-preview';
  if (tier === 'lite') return 'veo-3.1-lite-generate-preview';
  return 'veo-3.1-generate-preview';
}
