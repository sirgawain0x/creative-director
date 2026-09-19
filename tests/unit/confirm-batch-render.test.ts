import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mockConfirmDirectorBatch = vi.fn();
const mockEnqueueBatchShot = vi.fn();
const mockIsConfigured = vi.fn();

vi.mock('../../lib/pixels-generate-client.js', () => ({
  isPixelsGenerateConfigured: () => mockIsConfigured(),
  confirmDirectorBatch: (...args: unknown[]) => mockConfirmDirectorBatch(...args),
  enqueueBatchShot: (...args: unknown[]) => mockEnqueueBatchShot(...args),
  pollGenerateTask: vi.fn(),
  isPixelsBatchError: (error: unknown, code: string) =>
    error instanceof Error &&
    'code' in error &&
    (error as {code: string}).code === code,
  PIXELS_BATCH_ERROR_CODES: {
    quote_already_confirmed: 'quote_already_confirmed',
    selection_mismatch: 'selection_mismatch',
    batch_shot_already_started: 'batch_shot_already_started',
  },
  PixelsGenerateError: class PixelsGenerateError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

import {
  createBatchRenderQuote,
  resetBatchQuoteStore,
  rekeyStoredBatchQuote,
} from '../../lib/batch-render-quote.js';
import {confirmBatchRender} from '../../tools/confirm-batch-render.js';

describe('confirmBatchRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured.mockReturnValue(true);
    mockConfirmDirectorBatch.mockResolvedValue({
      batchConfirmId: 'bc-1',
      batchQuoteId: 'remote-bq-1',
      totalCrtvaiRequired: '1000000',
      jobs: [
        {
          shotId: 'shot-1',
          requestId: 'req-1',
          provider: 'veo',
          status: 'queued',
          generateEndpoint: '/api/pixels-render-veo',
        },
      ],
      enqueue: {batchConfirmId: 'bc-1', note: 'enqueue'},
    });
    mockEnqueueBatchShot.mockResolvedValue({
      request_id: 'req-1',
      provider: 'veo',
      status: 'processing',
      progress: 0,
      veo_task_id: 'veo-task-1',
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
    expect(mockConfirmDirectorBatch).not.toHaveBeenCalled();
  });

  it('uses batch-confirm then enqueueBatchShot — not per-shot quote/render', async () => {
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
    const localId = quote.batch_quote_id;
    quote.pixels_batch_quote_id = 'remote-bq-1';
    quote.batch_quote_id = 'remote-bq-1';
    rekeyStoredBatchQuote(localId, quote);

    const result = await confirmBatchRender({
      batch_quote_id: 'remote-bq-1',
      user_confirmed: true,
      access_token: 'privy-token',
      wallet_address: '0xabc',
      payment_tx_hash: '0xpay',
    });

    expect(result.status).toBe('jobs_started');
    expect(result.batch_confirm_id).toBe('bc-1');
    expect(result.jobs).toHaveLength(1);
    expect(mockConfirmDirectorBatch).toHaveBeenCalledOnce();
    expect(mockEnqueueBatchShot).toHaveBeenCalledOnce();
    const enqueueArgs = mockEnqueueBatchShot.mock.calls[0][1];
    expect(enqueueArgs.batchConfirmId).toBe('bc-1');
    expect(enqueueArgs.shotId).toBe('shot-1');
    expect(JSON.stringify(result)).not.toContain('mock_cut');
  });

  it('handles quote_already_confirmed from batch-confirm', async () => {
    const {PixelsGenerateError} = await import('../../lib/pixels-generate-client.js');
    mockConfirmDirectorBatch.mockRejectedValue(
      new PixelsGenerateError('Quote already used', 'quote_already_confirmed', 409),
    );

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
      access_token: 'token',
    });
    const localId = quote.batch_quote_id;
    quote.pixels_batch_quote_id = 'remote-bq-used';
    quote.batch_quote_id = 'remote-bq-used';
    rekeyStoredBatchQuote(localId, quote);

    const result = await confirmBatchRender({
      batch_quote_id: 'remote-bq-used',
      user_confirmed: true,
      access_token: 'token',
    });

    expect(result.status).toBe('error');
    expect(result.error_code).toBe('quote_already_confirmed');
    expect(mockEnqueueBatchShot).not.toHaveBeenCalled();
  });

  it('handles batch_shot_already_started per shot (409)', async () => {
    const {PixelsGenerateError} = await import('../../lib/pixels-generate-client.js');
    mockEnqueueBatchShot.mockRejectedValue(
      new PixelsGenerateError('Shot started', 'batch_shot_already_started', 409),
    );

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
      access_token: 'token',
    });
    const localId = quote.batch_quote_id;
    quote.pixels_batch_quote_id = 'remote-bq-1';
    quote.batch_quote_id = 'remote-bq-1';
    rekeyStoredBatchQuote(localId, quote);

    const result = await confirmBatchRender({
      batch_quote_id: 'remote-bq-1',
      user_confirmed: true,
      access_token: 'token',
    });

    expect(result.status).toBe('jobs_started');
    expect(result.jobs[0].error?.code).toBe('batch_shot_already_started');
  });
});
