/**
 * Returns a priced batch quote for storyboard shots — no CRTVAI spend.
 */

import {
  createBatchRenderQuote,
  type BatchShotInput,
  type BatchRenderQuote,
  type GenerateProvider,
} from '../lib/batch-render-quote.js';
import type {StoryboardScene} from '../lib/production-package.js';
import {
  isPixelsGenerateConfigured,
  quotePixelsDualRender,
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
}

export interface QuoteBatchRenderResult extends BatchRenderQuote {
  mock: false;
  pixels_api_configured: boolean;
  remote_quote_enriched: boolean;
}

async function enrichWithRemoteQuotes(
  quote: BatchRenderQuote,
  auth: PixelsGenerateAuth,
): Promise<boolean> {
  if (!isPixelsGenerateConfigured()) return false;

  let enriched = false;
  for (const shot of quote.shots) {
    try {
      const remote = await quotePixelsDualRender(auth, shot.duration_seconds);
      if (shot.provider === 'veo') {
        shot.estimated_usdc6 = remote.veo.estimatedUsdc6;
        shot.crtvai_required = remote.veo.crtvaiRequired;
      } else {
        shot.estimated_usdc6 = remote.seedance.estimatedUsdc6;
        shot.crtvai_required = remote.seedance.crtvaiRequired;
        shot.seedance_quote_id = remote.seedance.quoteId;
      }
      shot.formatted_usd = `$${(shot.estimated_usdc6 / 1_000_000).toFixed(2)}`;
      enriched = true;
    } catch {
      // Keep local pricing fallback when remote quote fails.
    }
  }

  if (enriched) {
    const totalUsdc6 = quote.shots.reduce((sum, s) => sum + s.estimated_usdc6, 0);
    const totalCrtvai = quote.shots.reduce(
      (sum, s) => sum + BigInt(s.crtvai_required),
      0n,
    );
    quote.total_estimated_usdc6 = totalUsdc6;
    quote.total_crtvai_required = totalCrtvai.toString();
    quote.total_formatted_usd = `$${(totalUsdc6 / 1_000_000).toFixed(2)}`;
  }

  return enriched;
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

  let remoteEnriched = false;
  if (input.access_token && isPixelsGenerateConfigured()) {
    remoteEnriched = await enrichWithRemoteQuotes(quote, {
      accessToken: input.access_token,
      walletAddress: input.wallet_address,
    });
  }

  return {
    ...quote,
    mock: false,
    pixels_api_configured: isPixelsGenerateConfigured(),
    remote_quote_enriched: remoteEnriched,
  };
}
