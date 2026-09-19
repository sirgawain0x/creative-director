import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('../../lib/pixels-generate-client.js', () => ({
  isPixelsGenerateConfigured: vi.fn(() => false),
  quotePixelsDualRender: vi.fn(),
}));

import {resetBatchQuoteStore} from '../../lib/batch-render-quote.js';
import {quoteBatchRender} from '../../tools/quote-batch-render.js';

describe('quoteBatchRender', () => {
  afterEach(() => {
    resetBatchQuoteStore();
  });

  it('returns a priced batch quote without mock URLs', async () => {
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
    expect(JSON.stringify(result)).not.toContain('storage.googleapis.com');
    expect(JSON.stringify(result)).not.toContain('mock_cut');
  });
});
