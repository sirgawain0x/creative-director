/**
 * Returns a priced batch quote for storyboard shots — no CRTVAI spend.
 * Primary path: POST /api/pixels-director-batch-quote (single call).
 */

import {
  createBatchRenderQuote,
  rekeyStoredBatchQuote,
  type BatchRenderQuote,
  type BatchShotInput,
  type GenerateProvider,
  type StoredBatchQuote,
  shotIdForScene,
} from '../lib/batch-render-quote.js';
import type {StoryboardScene} from '../lib/production-package.js';
import {
  isPixelsGenerateConfigured,
  quoteDirectorBatch,
  type DirectorBatchQuoteResponse,
  type PixelsGenerateAuth,
} from '../lib/pixels-generate-client.js';
import type {SeedanceAspectRatio, SeedanceResolution} from '../lib/seedance-pricing.js';

export interface QuoteBatchRenderInput {
  shots: BatchShotInput[] | StoryboardScene[];
  preferred_provider?: GenerateProvider;
  consistent_character?: boolean;
  aspect_ratio?: SeedanceAspectRatio;
  resolution?: SeedanceResolution;
  wallet_address?: string;
  access_token?: string;
  storyboard_id?: string;
}

export interface QuoteBatchRenderResult extends BatchRenderQuote {
  mock: false;
  pixels_api_configured: boolean;
  remote_quote_enriched: boolean;
}

function parseUsdc6FromFormatted(formattedUsd?: string): number | undefined {
  if (!formattedUsd) return undefined;
  const match = formattedUsd.replace(/[$,]/g, '').match(/([\d.]+)/);
  if (!match) return undefined;
  return Math.round(parseFloat(match[1]) * 1_000_000);
}

function applyRemoteBatchQuote(
  quote: BatchRenderQuote,
  remote: DirectorBatchQuoteResponse,
): void {
  quote.batch_quote_id = remote.batchQuoteId;
  quote.pixels_batch_quote_id = remote.batchQuoteId;
  quote.expires_at = remote.expiresAt;
  quote.remote_quote = true;
  quote.totals = {
    all_veo: {
      crtvai_required: remote.totals.allVeo.crtvaiRequired,
      formatted_usd: remote.totals.allVeo.formattedUsd ?? '',
    },
    all_seedance: {
      crtvai_required: remote.totals.allSeedance.crtvaiRequired,
      formatted_usd: remote.totals.allSeedance.formattedUsd ?? '',
    },
    recommended_mix: {
      crtvai_required: remote.totals.recommendedMix.crtvaiRequired,
      formatted_usd: remote.totals.recommendedMix.formattedUsd ?? '',
      providers: remote.totals.recommendedMix.providers,
    },
  };

  for (const remoteShot of remote.shots) {
    const localShot = quote.shots.find(
      (s) => s.shot_id === remoteShot.shotId || s.scene_index === Number(remoteShot.shotId.replace(/^shot-/, '')),
    );
    if (!localShot) continue;

    localShot.shot_id = remoteShot.shotId;
    localShot.provider = remoteShot.recommendedProvider;
    localShot.prompt = remoteShot.generate.prompt;
    localShot.duration_seconds = remoteShot.generate.duration;
    localShot.aspect_ratio = (remoteShot.generate.aspect_ratio as SeedanceAspectRatio) ?? localShot.aspect_ratio;
    localShot.resolution = (remoteShot.generate.resolution as SeedanceResolution) ?? localShot.resolution;
    localShot.provider_label =
      localShot.provider === 'seedance' ? 'Higgsfield Seedance 2.5' : 'Google Veo 3.1';

    localShot.veo_quote = {
      crtvai_required: remoteShot.veo.crtvaiRequired,
      formatted_usd: remoteShot.veo.formattedUsd ?? '',
      estimated_usdc6: remoteShot.veo.estimatedUsdc6,
    };
    localShot.seedance_quote = {
      crtvai_required: remoteShot.seedance.crtvaiRequired,
      formatted_usd: remoteShot.seedance.formattedUsd ?? '',
      estimated_usdc6: remoteShot.seedance.estimatedUsdc6,
      quote_id: remoteShot.seedance.quoteId,
    };

    const selected =
      localShot.provider === 'veo' ? remoteShot.veo : remoteShot.seedance;
    localShot.crtvai_required = selected.crtvaiRequired;
    localShot.formatted_usd = selected.formattedUsd ?? localShot.formatted_usd;
    localShot.estimated_usdc6 =
      selected.estimatedUsdc6 ??
      parseUsdc6FromFormatted(selected.formattedUsd) ??
      localShot.estimated_usdc6;
    if (localShot.provider === 'seedance' && remoteShot.seedance.quoteId) {
      localShot.seedance_quote_id = remoteShot.seedance.quoteId;
    }
  }

  const totalCrtvai = quote.shots.reduce(
    (sum, s) => sum + BigInt(s.crtvai_required),
    0n,
  );
  const totalUsdc6 = quote.shots.reduce((sum, s) => sum + s.estimated_usdc6, 0);
  quote.total_crtvai_required = totalCrtvai.toString();
  quote.total_estimated_usdc6 = totalUsdc6;
  quote.total_formatted_usd = remote.totals.recommendedMix.formattedUsd ?? `$${(totalUsdc6 / 1_000_000).toFixed(2)}`;
}

async function enrichWithRemoteBatchQuote(
  quote: BatchRenderQuote,
  auth: PixelsGenerateAuth,
  options: {
    preferred_provider?: GenerateProvider;
    consistent_character?: boolean;
    aspect_ratio?: SeedanceAspectRatio;
    resolution?: SeedanceResolution;
    storyboard_id?: string;
  },
): Promise<boolean> {
  if (!isPixelsGenerateConfigured()) return false;

  try {
    const remote = await quoteDirectorBatch(auth, {
      shots: quote.shots.map((s) => ({
        shotId: s.shot_id || shotIdForScene(s.scene_index),
        prompt: s.prompt,
        duration: s.duration_seconds,
        aspectRatio: s.aspect_ratio,
        consistentCharacter: options.consistent_character ?? false,
      })),
      providerPreference: options.preferred_provider,
      resolution: options.resolution ?? '720p',
      storyboardId: options.storyboard_id,
    });
    applyRemoteBatchQuote(quote, remote);
    return true;
  } catch {
    return false;
  }
}

/** Build a batch CRTVAI quote for human confirmation — never spends or renders. */
export async function quoteBatchRender(
  input: QuoteBatchRenderInput,
): Promise<QuoteBatchRenderResult> {
  const quote = createBatchRenderQuote({
    shots: input.shots,
    preferred_provider: input.preferred_provider,
    consistent_character: input.consistent_character,
    aspect_ratio: input.aspect_ratio,
    resolution: input.resolution,
    wallet_address: input.wallet_address,
    access_token: input.access_token,
  });

  const localQuoteId = quote.batch_quote_id;
  let remoteEnriched = false;
  if (input.access_token && isPixelsGenerateConfigured()) {
    remoteEnriched = await enrichWithRemoteBatchQuote(
      quote,
      {
        accessToken: input.access_token,
        walletAddress: input.wallet_address,
      },
      {
        preferred_provider: input.preferred_provider,
        consistent_character: input.consistent_character,
        aspect_ratio: input.aspect_ratio,
        resolution: input.resolution,
        storyboard_id: input.storyboard_id,
      },
    );
    if (remoteEnriched && quote.batch_quote_id !== localQuoteId) {
      rekeyStoredBatchQuote(localQuoteId, quote as StoredBatchQuote);
    }
  }

  return {
    ...quote,
    mock: false,
    pixels_api_configured: isPixelsGenerateConfigured(),
    remote_quote_enriched: remoteEnriched,
  };
}
