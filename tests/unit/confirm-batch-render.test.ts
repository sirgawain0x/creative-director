import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mockStartVeoRender = vi.fn();
const mockStartSeedanceRender = vi.fn();
const mockIsConfigured = vi.fn();

vi.mock('../../lib/pixels-generate-client.js', () => ({
  isPixelsGenerateConfigured: () => mockIsConfigured(),
  startVeoRender: (...args: unknown[]) => mockStartVeoRender(...args),
  startSeedanceRender: (...args: unknown[]) => mockStartSeedanceRender(...args),
  pollGenerateTask: vi.fn(),
}));

import {
  createBatchRenderQuote,
  resetBatchQuoteStore,
} from '../../lib/batch-render-quote.js';
import {confirmBatchRender} from '../../tools/confirm-batch-render.js';

describe('confirmBatchRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured.mockReturnValue(true);
    mockStartVeoRender.mockResolvedValue({
      request_id: 'job-veo-1',
      provider: 'veo',
      status: 'processing',
      progress: 0,
      veo_task_id: 'veo-task-1',
    });
    mockStartSeedanceRender.mockResolvedValue({
      request_id: 'job-seed-1',
      provider: 'seedance',
      status: 'completed',
      progress: 100,
      output_video_url: 'https://cdn.example.com/clip.mp4',
    });
  });

  afterEach(() => {
    resetBatchQuoteStore();
  });

  it('rejects when user_confirmed is false', async () => {
    const quote = createBatchRenderQuote({
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
    });

    const result = await confirmBatchRender({
      batch_quote_id: quote.batch_quote_id,
      user_confirmed: false,
      access_token: 'token',
    });

    expect(result.status).toBe('rejected');
    expect(result.jobs).toHaveLength(0);
    expect(mockStartVeoRender).not.toHaveBeenCalled();
  });

  it('starts jobs after confirmation without inventing fake URLs', async () => {
    const quote = createBatchRenderQuote({
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
      access_token: 'privy-token',
      wallet_address: '0xabc',
    });

    const result = await confirmBatchRender({
      batch_quote_id: quote.batch_quote_id,
      user_confirmed: true,
      access_token: 'privy-token',
      wallet_address: '0xabc',
    });

    expect(result.status).toBe('jobs_started');
    expect(result.jobs).toHaveLength(1);
    expect(mockStartVeoRender).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('mock_cut');
    expect(JSON.stringify(result)).not.toContain('storage.googleapis.com');
  });
});
