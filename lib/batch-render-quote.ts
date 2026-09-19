/**
 * Storyboard → batch render quote mapping and in-memory quote store.
 */

import {randomUUID} from 'node:crypto';
import {
  clampFlowDuration,
  quoteFlowCreditsUsdc6,
  quoteFlowTotalCredits,
  type VeoTier,
} from './generative-pricing.js';
import {
  clampSeedanceDuration,
  quoteSeedanceMinCrtvaiWei,
  quoteSeedanceUsdc6,
  type SeedanceAspectRatio,
  type SeedanceResolution,
} from './seedance-pricing.js';
import type {StoryboardScene} from './production-package.js';

export type GenerateProvider = 'veo' | 'seedance';

export interface BatchShotInput {
  scene_index: number;
  timestamp_start: string;
  timestamp_end: string;
  duration_seconds?: number;
  visual_prompt: string;
  camera_movement: string;
  lighting?: string;
  consistent_character?: boolean;
}

export interface BatchShotQuote {
  scene_index: number;
  shot_id: string;
  timestamp_start: string;
  timestamp_end: string;
  provider: GenerateProvider;
  prompt: string;
  duration_seconds: number;
  aspect_ratio: SeedanceAspectRatio;
  resolution: SeedanceResolution;
  estimated_usdc6: number;
  crtvai_required: string;
  formatted_usd: string;
  seedance_quote_id?: string;
  provider_label: string;
  /** Per-provider pricing from Pixels batch-quote (when remote). */
  veo_quote?: {crtvai_required: string; formatted_usd: string; estimated_usdc6?: number};
  seedance_quote?: {
    crtvai_required: string;
    formatted_usd: string;
    estimated_usdc6?: number;
    quote_id?: string;
  };
}

export interface BatchRenderQuote {
  batch_quote_id: string;
  status: 'pending_confirm';
  shot_count: number;
  shots: BatchShotQuote[];
  total_estimated_usdc6: number;
  total_crtvai_required: string;
  total_formatted_usd: string;
  notice: string;
  created_at: string;
  preferred_provider?: GenerateProvider;
  consistent_character: boolean;
  /** Pixels server batch quote metadata (when remote quote succeeded). */
  pixels_batch_quote_id?: string;
  expires_at?: string;
  remote_quote?: boolean;
  totals?: {
    all_veo: {crtvai_required: string; formatted_usd: string};
    all_seedance: {crtvai_required: string; formatted_usd: string};
    recommended_mix: {
      crtvai_required: string;
      formatted_usd: string;
      providers?: Record<string, number>;
    };
  };
}

export interface StoredBatchQuote extends BatchRenderQuote {
  wallet_address?: string;
  access_token?: string;
}

const quoteStore = new Map<string, StoredBatchQuote>();

const PIXELS_VEO_TIER: VeoTier = 'standard';
const PIXELS_VEO_QUALITY = '720p';

function formatUsd(usdc6: number): string {
  return `$${(usdc6 / 1_000_000).toFixed(2)}`;
}

function parseDurationFromTimecodes(
  start: string,
  end: string,
  fallbackSeconds: number,
): number {
  const parseTc = (tc: string): number | null => {
    const parts = tc.trim().split(':').map((p) => Number(p));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  };
  const startSec = parseTc(start);
  const endSec = parseTc(end);
  if (startSec != null && endSec != null && endSec > startSec) {
    return endSec - startSec;
  }
  return fallbackSeconds;
}

export function buildShotPrompt(
  visualPrompt: string,
  cameraMovement: string,
): string {
  return `${visualPrompt.trim()}. Camera movement: ${cameraMovement.trim()}. Music video aesthetic.`;
}

/** Stable shot id for Pixels batch APIs (bijection with scene_index). */
export function shotIdForScene(sceneIndex: number): string {
  return `shot-${sceneIndex}`;
}

export function selectProvider(input: {
  consistent_character?: boolean;
  preferred_provider?: GenerateProvider;
}): GenerateProvider {
  if (input.preferred_provider === 'veo' || input.preferred_provider === 'seedance') {
    return input.preferred_provider;
  }
  return input.consistent_character ? 'seedance' : 'veo';
}

function quoteVeoShot(durationSeconds: number): {
  estimated_usdc6: number;
  crtvai_required: string;
  duration_seconds: number;
} {
  const duration = clampFlowDuration(durationSeconds);
  const credits = quoteFlowTotalCredits({
    duration,
    quality: PIXELS_VEO_QUALITY,
    tier: PIXELS_VEO_TIER,
    stillCount: 1,
    stillQuality: '2K',
  });
  const quote = quoteFlowCreditsUsdc6(credits);
  if (!quote) {
    throw new Error('Unable to quote Veo shot');
  }
  return {
    estimated_usdc6: quote.estimatedUsdc6,
    crtvai_required: quote.minCrtvaiWei.toString(),
    duration_seconds: duration,
  };
}

function quoteSeedanceShot(
  durationSeconds: number,
  resolution: SeedanceResolution,
): {
  estimated_usdc6: number;
  crtvai_required: string;
  duration_seconds: number;
  seedance_quote_id: string;
} {
  const duration = clampSeedanceDuration(durationSeconds);
  const estimated_usdc6 = quoteSeedanceUsdc6({duration, resolution});
  const crtvaiWei = quoteSeedanceMinCrtvaiWei(estimated_usdc6);
  return {
    estimated_usdc6,
    crtvai_required: crtvaiWei.toString(),
    duration_seconds: duration,
    seedance_quote_id: `local-${randomUUID()}`,
  };
}

export function mapStoryboardSceneToShot(
  scene: StoryboardScene,
  options: {
    preferred_provider?: GenerateProvider;
    project_consistent_character?: boolean;
    aspect_ratio?: SeedanceAspectRatio;
    resolution?: SeedanceResolution;
  } = {},
): BatchShotQuote {
  const durationSeconds = parseDurationFromTimecodes(
    scene.timestamp_start,
    scene.timestamp_end,
    8,
  );
  const consistentCharacter = options.project_consistent_character ?? false;
  const provider = selectProvider({
    consistent_character: consistentCharacter,
    preferred_provider: options.preferred_provider,
  });
  const aspectRatio = options.aspect_ratio ?? '16:9';
  const resolution = options.resolution ?? '720p';
  const prompt = buildShotPrompt(scene.visual_prompt, scene.camera_movement);

  if (provider === 'seedance') {
    const seedance = quoteSeedanceShot(durationSeconds, resolution);
    return {
      scene_index: scene.scene_index,
      shot_id: shotIdForScene(scene.scene_index),
      timestamp_start: scene.timestamp_start,
      timestamp_end: scene.timestamp_end,
      provider: 'seedance',
      prompt,
      duration_seconds: seedance.duration_seconds,
      aspect_ratio: aspectRatio,
      resolution,
      estimated_usdc6: seedance.estimated_usdc6,
      crtvai_required: seedance.crtvai_required,
      formatted_usd: formatUsd(seedance.estimated_usdc6),
      seedance_quote_id: seedance.seedance_quote_id,
      provider_label: 'Higgsfield Seedance 2.5',
    };
  }

  const veo = quoteVeoShot(durationSeconds);
  return {
    scene_index: scene.scene_index,
    shot_id: shotIdForScene(scene.scene_index),
    timestamp_start: scene.timestamp_start,
    timestamp_end: scene.timestamp_end,
    provider: 'veo',
    prompt,
    duration_seconds: veo.duration_seconds,
    aspect_ratio: aspectRatio,
    resolution,
    estimated_usdc6: veo.estimated_usdc6,
    crtvai_required: veo.crtvai_required,
    formatted_usd: formatUsd(veo.estimated_usdc6),
    provider_label: 'Google Veo 3.1',
  };
}

export function createBatchRenderQuote(input: {
  shots: BatchShotInput[] | StoryboardScene[];
  preferred_provider?: GenerateProvider;
  consistent_character?: boolean;
  aspect_ratio?: SeedanceAspectRatio;
  resolution?: SeedanceResolution;
  wallet_address?: string;
  access_token?: string;
}): BatchRenderQuote {
  const consistentCharacter = input.consistent_character ?? false;
  const shotQuotes = input.shots.map((shot) => {
    const scene: StoryboardScene = {
      scene_index: shot.scene_index,
      timestamp_start: shot.timestamp_start,
      timestamp_end: shot.timestamp_end,
      camera_movement: shot.camera_movement,
      lighting: 'lighting' in shot && shot.lighting ? shot.lighting : 'cinematic',
      visual_prompt: shot.visual_prompt,
    };
    return mapStoryboardSceneToShot(scene, {
      preferred_provider: input.preferred_provider,
      project_consistent_character: consistentCharacter,
      aspect_ratio: input.aspect_ratio,
      resolution: input.resolution,
    });
  });

  const totalUsdc6 = shotQuotes.reduce((sum, s) => sum + s.estimated_usdc6, 0);
  const totalCrtvai = shotQuotes.reduce(
    (sum, s) => sum + BigInt(s.crtvai_required),
    0n,
  );

  const batchQuoteId = randomUUID();
  const quote: StoredBatchQuote = {
    batch_quote_id: batchQuoteId,
    status: 'pending_confirm',
    shot_count: shotQuotes.length,
    shots: shotQuotes,
    total_estimated_usdc6: totalUsdc6,
    total_crtvai_required: totalCrtvai.toString(),
    total_formatted_usd: formatUsd(totalUsdc6),
    notice:
      'QUOTE ONLY — no CRTVAI spent and no clips rendered. User must confirm before confirm_batch_render.',
    created_at: new Date().toISOString(),
    preferred_provider: input.preferred_provider,
    consistent_character: consistentCharacter,
    wallet_address: input.wallet_address,
    access_token: input.access_token,
  };

  quoteStore.set(batchQuoteId, quote);
  return quote;
}

export function getStoredBatchQuote(
  batchQuoteId: string,
): StoredBatchQuote | undefined {
  return quoteStore.get(batchQuoteId);
}

/** Re-key stored quote after Pixels returns a remote batchQuoteId. */
export function rekeyStoredBatchQuote(
  oldId: string,
  quote: StoredBatchQuote,
): void {
  quoteStore.delete(oldId);
  quoteStore.set(quote.batch_quote_id, quote);
}

export function clearStoredBatchQuote(batchQuoteId: string): void {
  quoteStore.delete(batchQuoteId);
}

/** Test helper — reset in-memory store between unit tests. */
export function resetBatchQuoteStore(): void {
  quoteStore.clear();
}
