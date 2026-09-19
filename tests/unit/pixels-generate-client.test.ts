import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

import {
  confirmDirectorBatch,
  enqueueBatchShot,
  PIXELS_BATCH_ERROR_CODES,
  PixelsGenerateError,
  quoteDirectorBatch,
} from '../../lib/pixels-generate-client.js';

const auth = {accessToken: 'privy-token', walletAddress: '0xabc'};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('pixels-generate-client batch APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PIXELS_API_BASE_URL = 'https://pixels.test';
  });

  afterEach(() => {
    delete process.env.PIXELS_API_BASE_URL;
  });

  it('quoteDirectorBatch posts to /api/pixels-director-batch-quote', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        batchQuoteId: 'bq-1',
        expiresAt: '2026-09-19T01:00:00.000Z',
        shotCount: 1,
        shots: [
          {
            shotId: 'shot-1',
            recommendedProvider: 'veo',
            generate: {
              prompt: 'Test',
              duration: 8,
              aspect_ratio: '16:9',
              resolution: '720p',
            },
            veo: {provider: 'veo', crtvaiRequired: '1000000', formattedUsd: '$1.00'},
            seedance: {
              provider: 'seedance',
              crtvaiRequired: '1200000',
              formattedUsd: '$1.20',
              quoteId: 'sq-1',
            },
          },
        ],
        totals: {
          allVeo: {crtvaiRequired: '1000000', formattedUsd: '$1.00'},
          allSeedance: {crtvaiRequired: '1200000', formattedUsd: '$1.20'},
          recommendedMix: {
            crtvaiRequired: '1000000',
            formattedUsd: '$1.00',
            providers: {veo: 1},
          },
        },
      }),
    );

    const result = await quoteDirectorBatch(auth, {
      shots: [
        {
          shotId: 'shot-1',
          prompt: 'Test',
          duration: 8,
          aspectRatio: '16:9',
        },
      ],
    });

    expect(result.batchQuoteId).toBe('bq-1');
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://pixels.test/api/pixels-director-batch-quote');
    const body = JSON.parse(init.body as string);
    expect(body.token).toBe('privy-token');
    expect(body.walletAddress).toBe('0xabc');
    expect(body.shots[0].shotId).toBe('shot-1');
  });

  it('confirmDirectorBatch posts selections bijection', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        batchConfirmId: 'bc-1',
        batchQuoteId: 'bq-1',
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
        enqueue: {batchConfirmId: 'bc-1', note: 'enqueue per shot'},
      }),
    );

    const result = await confirmDirectorBatch(auth, {
      batchQuoteId: 'bq-1',
      selections: [{shotId: 'shot-1', provider: 'veo', requestId: 'req-1'}],
      paymentTxHash: '0xpay',
    });

    expect(result.batchConfirmId).toBe('bc-1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.batchQuoteId).toBe('bq-1');
    expect(body.paymentTxHash).toBe('0xpay');
    expect(body.selections).toHaveLength(1);
  });

  it('confirmDirectorBatch throws quote_already_confirmed', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {error: 'quote_already_confirmed', message: 'Quote already used'},
        409,
      ),
    );

    await expect(
      confirmDirectorBatch(auth, {
        batchQuoteId: 'bq-used',
        selections: [{shotId: 'shot-1', provider: 'veo', requestId: 'req-1'}],
      }),
    ).rejects.toMatchObject({
      code: 'quote_already_confirmed',
      status: 409,
    });
  });

  it('enqueueBatchShot sends only batch ids — no paymentTxHash', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 'veo-task-1',
        status: 'processing',
        progress: 0,
        pixelsRequestId: 'req-1',
      }),
    );

    const result = await enqueueBatchShot(auth, {
      generateEndpoint: '/api/pixels-render-veo',
      batchConfirmId: 'bc-1',
      shotId: 'shot-1',
      requestId: 'req-1',
    });

    expect(result.request_id).toBe('req-1');
    expect(result.provider).toBe('veo');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.batchConfirmId).toBe('bc-1');
    expect(body.shotId).toBe('shot-1');
    expect(body.requestId).toBe('req-1');
    expect(body.paymentTxHash).toBeUndefined();
    expect(body.prompt).toBeUndefined();
  });

  it('enqueueBatchShot surfaces batch_shot_already_started (409)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          code: PIXELS_BATCH_ERROR_CODES.batch_shot_already_started,
          message: 'Shot already started',
        },
        409,
      ),
    );

    await expect(
      enqueueBatchShot(auth, {
        generateEndpoint: '/api/seedance-generate',
        batchConfirmId: 'bc-1',
        shotId: 'shot-2',
        requestId: 'req-2',
      }),
    ).rejects.toBeInstanceOf(PixelsGenerateError);
  });
});
