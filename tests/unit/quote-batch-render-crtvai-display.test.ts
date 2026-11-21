import {afterEach, describe, expect, it, vi} from 'vitest';

const mockQuoteDirectorBatch = vi.fn();
const mockIsConfigured = vi.fn();

vi.mock('../../lib/pixels-generate-client.js', () => ({
  isPixelsGenerateConfigured: () => mockIsConfigured(),
  quoteDirectorBatch: (...args: unknown[]) => mockQuoteDirectorBatch(...args),
}));

import {resetBatchQuoteStore} from '../../lib/batch-render-quote.js';
import {quoteBatchRender} from '../../tools/quote-batch-render.js';

const SHOT = {
  scene_index: 1,
  timestamp_start: '00:00',
  timestamp_end: '00:15',
  duration_seconds: 15,
  visual_prompt: 'Rail yard at night',
  camera_movement: 'low tracking',
};

describe('quoteBatchRender CRTVAI display', () => {
  afterEach(() => {
    resetBatchQuoteStore();
    vi.clearAllMocks();
  });

  it('reports live-curve CRTVAI (not 1:1 with USD) when Pixels prices the batch', async () => {
    mockIsConfigured.mockReturnValue(true);
    // $10.50 buys ~1.199 CRTVAI on the curve (~$8.76 / CRTVAI).
    const wei = '1199074926053156800';
    mockQuoteDirectorBatch.mockResolvedValue({
      batchQuoteId: 'remote-bq-live',
      expiresAt: '2026-11-21T02:00:00.000Z',
      shotCount: 1,
      shots: [
        {
          shotId: 'shot-1',
          recommendedProvider: 'omni',
          generate: {prompt: 'p', duration: 15, aspect_ratio: '16:9', resolution: '720p'},
          omni: {provider: 'omni', crtvaiRequired: wei, formattedUsd: '$10.50', estimatedUsdc6: 10_500_000},
          veo: {provider: 'veo', crtvaiRequired: wei, formattedUsd: '$10.50', estimatedUsdc6: 10_500_000},
          seedance: {provider: 'seedance', crtvaiRequired: wei, formattedUsd: '$10.50', quoteId: 'sq'},
        },
      ],
      totals: {
        allOmni: {crtvaiRequired: wei, formattedUsd: '$10.50'},
        allVeo: {crtvaiRequired: wei, formattedUsd: '$10.50'},
        allSeedance: {crtvaiRequired: wei, formattedUsd: '$10.50'},
        recommendedMix: {crtvaiRequired: wei, formattedUsd: '$10.50', providers: {omni: 1}},
      },
    });

    const result = await quoteBatchRender({
      shots: [SHOT],
      preferred_provider: 'omni',
      access_token: 'privy-token',
      wallet_address: '0xabc',
    });

    expect(result.crtvai_price_source).toBe('live_curve');
    expect(result.total_crtvai_display).toBeCloseTo(1.1991, 4);
    expect(result.shots[0].crtvai_display).toBeCloseTo(1.1991, 4);
    expect(result.usd_per_crtvai).toBeCloseTo(8.7566, 3);
    expect(result.total_crtvai_display).not.toBe(10.5);
  });

  it('never exposes placeholder 1:1 CRTVAI when live pricing is unavailable', async () => {
    mockIsConfigured.mockReturnValue(false);

    const result = await quoteBatchRender({shots: [SHOT], preferred_provider: 'omni'});

    expect(result.crtvai_price_source).toBe('unavailable');
    expect(result.total_crtvai_display).toBeNull();
    expect(result.total_crtvai_required).toBe('unavailable');
    expect(result.shots[0].crtvai_display).toBeNull();
    expect(result.shots[0].crtvai_required).toBe('unavailable');
    expect(result.total_formatted_usd).toMatch(/^\$\d+\.\d{2}$/);
    expect(result.crtvai_presentation_rules).toContain('NOT pegged to USD');
  });
});
