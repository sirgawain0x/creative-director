import {afterEach, describe, expect, it, vi} from 'vitest';

const mockQuoteDirectorBatch = vi.fn();
const mockIsConfigured = vi.fn();

vi.mock('../../lib/pixels-generate-client.js', () => ({
  isPixelsGenerateConfigured: () => mockIsConfigured(),
  quoteDirectorBatch: (...args: unknown[]) => mockQuoteDirectorBatch(...args),
}));

import {resetBatchQuoteStore} from '../../lib/batch-render-quote.js';
import {quoteBatchRender} from '../../tools/quote-batch-render.js';

describe('quoteBatchRender', () => {
  afterEach(() => {
    resetBatchQuoteStore();
    vi.clearAllMocks();
  });

  it('returns a priced batch quote without mock URLs', async () => {
    mockIsConfigured.mockReturnValue(false);

    const result = await quoteBatchRender({
      shots: [
        {
          scene_index: 1,
          timestamp_start: '00:00',
          timestamp_end: '00:08',
          duration_seconds: 8,
          visual_prompt: 'Neon alley',
          camera_movement: 'handheld',
        },
      ],
    });

    expect(result.mock).toBe(false);
    expect(result.status).toBe('pending_confirm');
    expect(result.batch_quote_id).toBeTruthy();
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0].shot_id).toBe('shot-1');
    expect(JSON.stringify(result)).not.toContain('storage.googleapis.com');
    expect(JSON.stringify(result)).not.toContain('mock_cut');
  });

  it('prefers Pixels server estimates when batch-quote succeeds', async () => {
    mockIsConfigured.mockReturnValue(true);
    mockQuoteDirectorBatch.mockResolvedValue({
      batchQuoteId: 'remote-bq-1',
      expiresAt: '2026-09-19T01:00:00.000Z',
      shotCount: 1,
      shots: [
        {
          shotId: 'shot-1',
          recommendedProvider: 'veo',
          generate: {
            prompt: 'Neon alley. Camera movement: handheld. Music video aesthetic.',
            duration: 8,
            aspect_ratio: '16:9',
            resolution: '720p',
          },
          veo: {
            provider: 'veo',
            crtvaiRequired: '999999',
            formattedUsd: '$0.99',
            estimatedUsdc6: 990000,
          },
          seedance: {
            provider: 'seedance',
            crtvaiRequired: '1200000',
            formattedUsd: '$1.20',
            quoteId: 'sq-remote',
          },
        },
      ],
      totals: {
        allVeo: {crtvaiRequired: '999999', formattedUsd: '$0.99'},
        allSeedance: {crtvaiRequired: '1200000', formattedUsd: '$1.20'},
        recommendedMix: {
          crtvaiRequired: '999999',
          formattedUsd: '$0.99',
          providers: {veo: 1},
        },
      },
    });

    const result = await quoteBatchRender({
      shots: [
        {
          scene_index: 1,
          timestamp_start: '00:00',
          timestamp_end: '00:08',
          duration_seconds: 8,
          visual_prompt: 'Neon alley',
          camera_movement: 'handheld',
        },
      ],
      access_token: 'privy-token',
      wallet_address: '0xabc',
    });

    expect(result.remote_quote_enriched).toBe(true);
    expect(result.batch_quote_id).toBe('remote-bq-1');
    expect(result.pixels_batch_quote_id).toBe('remote-bq-1');
    expect(result.shots[0].crtvai_required).toBe('999999');
    expect(result.shots[0].formatted_usd).toBe('$0.99');
    expect(result.totals?.recommended_mix.formatted_usd).toBe('$0.99');
    expect(mockQuoteDirectorBatch).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('privy-token');
  });

  it('does not echo access_token in tool response', async () => {
    mockIsConfigured.mockReturnValue(false);

    const result = await quoteBatchRender({
      shots: [
        {
          scene_index: 1,
          timestamp_start: '00:00',
          timestamp_end: '00:08',
          duration_seconds: 8,
          visual_prompt: 'Test',
          camera_movement: 'static',
        },
      ],
      access_token: 'secret-privy-token',
      wallet_address: '0xsecret',
    });

    expect(result).not.toHaveProperty('access_token');
    expect(result).not.toHaveProperty('wallet_address');
    expect(JSON.stringify(result)).not.toContain('secret-privy-token');
  });
});
