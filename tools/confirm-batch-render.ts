/**
 * Confirms a batch quote and starts Pixels Generate jobs — real spend path.
 * Primary path: batch-confirm → per-shot enqueue with batchConfirmId.
 */

import {randomUUID} from 'node:crypto';
import {
  getStoredBatchQuote,
  type BatchShotQuote,
} from '../lib/batch-render-quote.js';
import {
  confirmDirectorBatch,
  enqueueBatchShot,
  isPixelsBatchError,
  isPixelsGenerateConfigured,
  PIXELS_BATCH_ERROR_CODES,
  pollGenerateTask,
  PixelsGenerateError,
  type PixelsGenerateAuth,
  type PixelsGenerateJobResult,
} from '../lib/pixels-generate-client.js';

export interface ConfirmBatchRenderInput {
  batch_quote_id: string;
  user_confirmed: boolean;
  access_token?: string;
  wallet_address?: string;
  payment_tx_hash?: string;
}

export interface ConfirmBatchShotResult {
  scene_index: number;
  shot_id: string;
  provider: BatchShotQuote['provider'];
  request_id: string;
  status: PixelsGenerateJobResult['status'];
  progress: number;
  model?: string;
  veo_task_id?: string;
  output_video_url?: string;
  error?: {code: string; message: string; type?: string};
}

export interface ConfirmBatchRenderResult {
  mock: false;
  batch_quote_id: string;
  batch_confirm_id?: string;
  status: 'jobs_started' | 'rejected' | 'error';
  notice: string;
  shot_count: number;
  jobs: ConfirmBatchShotResult[];
  clip_urls: string[];
  error_code?: string;
}

async function enqueueShotJob(
  job: {
    shotId: string;
    requestId: string;
    provider: BatchShotQuote['provider'];
    generateEndpoint: string;
  },
  batchConfirmId: string,
  auth: PixelsGenerateAuth,
  sceneIndex: number,
): Promise<ConfirmBatchShotResult> {
  try {
    const result = await enqueueBatchShot(auth, {
      generateEndpoint: job.generateEndpoint,
      batchConfirmId,
      shotId: job.shotId,
      requestId: job.requestId,
    });

    let outputUrl = result.output_video_url;
    if (
      !outputUrl &&
      (result.status === 'processing' || result.status === 'queued') &&
      result.request_id
    ) {
      try {
        const polled = await pollGenerateTask(auth, result.request_id);
        if (polled.status === 'completed' && polled.output_video_url) {
          outputUrl = polled.output_video_url;
        }
      } catch {
        // Poll is best-effort; job may still be processing.
      }
    }

    return {
      scene_index: sceneIndex,
      shot_id: job.shotId,
      provider: job.provider,
      request_id: result.request_id,
      status: result.status,
      progress: result.progress,
      model: result.model,
      veo_task_id: result.veo_task_id,
      output_video_url: outputUrl,
      error: result.error,
    };
  } catch (error) {
    if (isPixelsBatchError(error, PIXELS_BATCH_ERROR_CODES.batch_shot_already_started)) {
      return {
        scene_index: sceneIndex,
        shot_id: job.shotId,
        provider: job.provider,
        request_id: job.requestId,
        status: 'failed',
        progress: 0,
        error: {
          code: PIXELS_BATCH_ERROR_CODES.batch_shot_already_started,
          message:
            (error as PixelsGenerateError).message ||
            'Shot already started — concurrent enqueue rejected (409).',
        },
      };
    }
    return {
      scene_index: sceneIndex,
      shot_id: job.shotId,
      provider: job.provider,
      request_id: job.requestId,
      status: 'failed',
      progress: 0,
      error: {
        code: error instanceof PixelsGenerateError ? error.code : 'ENQUEUE_FAILED',
        message:
          error instanceof Error ? error.message : 'Per-shot enqueue failed after batch confirm.',
      },
    };
  }
}

/** Start Pixels Generate jobs after explicit user confirmation. */
export async function confirmBatchRender(
  input: ConfirmBatchRenderInput,
): Promise<ConfirmBatchRenderResult> {
  if (!input.user_confirmed) {
    return {
      mock: false,
      batch_quote_id: input.batch_quote_id,
      status: 'rejected',
      notice: 'Render not started — user_confirmed must be true.',
      shot_count: 0,
      jobs: [],
      clip_urls: [],
    };
  }

  const stored = getStoredBatchQuote(input.batch_quote_id);
  if (!stored) {
    return {
      mock: false,
      batch_quote_id: input.batch_quote_id,
      status: 'error',
      notice: 'Unknown or expired batch_quote_id. Call quote_batch_render first.',
      shot_count: 0,
      jobs: [],
      clip_urls: [],
    };
  }

  if (!isPixelsGenerateConfigured()) {
    return {
      mock: false,
      batch_quote_id: input.batch_quote_id,
      status: 'error',
      notice:
        'PIXELS_API_BASE_URL is not configured on the agent runtime. Cannot start real renders.',
      shot_count: stored.shot_count,
      jobs: [],
      clip_urls: [],
    };
  }

  const accessToken = input.access_token ?? stored.access_token;
  if (!accessToken) {
    return {
      mock: false,
      batch_quote_id: input.batch_quote_id,
      status: 'error',
      notice:
        'access_token (Privy) required to start Pixels Generate jobs. Pass from the Pixels session.',
      shot_count: stored.shot_count,
      jobs: [],
      clip_urls: [],
    };
  }

  const auth: PixelsGenerateAuth = {
    accessToken,
    walletAddress: input.wallet_address ?? stored.wallet_address,
  };

  if (!stored.remote_quote || !stored.pixels_batch_quote_id) {
    return {
      mock: false,
      batch_quote_id: input.batch_quote_id,
      status: 'error',
      notice:
        'No valid Pixels batch quote — remote batch-quote did not succeed. Re-call quote_batch_render with access_token and wallet_address.',
      shot_count: stored.shot_count,
      jobs: [],
      clip_urls: [],
    };
  }

  const batchQuoteId = stored.pixels_batch_quote_id;
  const selections = stored.shots.map((shot) => ({
    shotId: shot.shot_id,
    provider: shot.provider,
    requestId: `cd-${shot.shot_id}-${randomUUID()}`,
  }));

  let batchConfirmId: string;
  let confirmJobs: Array<{
    shotId: string;
    requestId: string;
    provider: BatchShotQuote['provider'];
    generateEndpoint: string;
  }>;

  try {
    const confirmed = await confirmDirectorBatch(auth, {
      batchQuoteId,
      selections,
      paymentTxHash: input.payment_tx_hash,
    });
    batchConfirmId = confirmed.batchConfirmId;
    confirmJobs = confirmed.jobs.map((j) => ({
      shotId: j.shotId,
      requestId: j.requestId,
      provider: j.provider,
      generateEndpoint: j.generateEndpoint,
    }));
  } catch (error) {
    if (error instanceof PixelsGenerateError) {
      if (
        isPixelsBatchError(error, PIXELS_BATCH_ERROR_CODES.quote_already_confirmed)
      ) {
        return {
          mock: false,
          batch_quote_id: input.batch_quote_id,
          status: 'error',
          error_code: PIXELS_BATCH_ERROR_CODES.quote_already_confirmed,
          notice:
            'Batch quote already confirmed — call quote_batch_render for a new quote.',
          shot_count: stored.shot_count,
          jobs: [],
          clip_urls: [],
        };
      }
      if (isPixelsBatchError(error, PIXELS_BATCH_ERROR_CODES.selection_mismatch)) {
        return {
          mock: false,
          batch_quote_id: input.batch_quote_id,
          status: 'error',
          error_code: PIXELS_BATCH_ERROR_CODES.selection_mismatch,
          notice:
            'Selection mismatch — each quoted shotId must appear exactly once in selections.',
          shot_count: stored.shot_count,
          jobs: [],
          clip_urls: [],
        };
      }
    }
    return {
      mock: false,
      batch_quote_id: input.batch_quote_id,
      status: 'error',
      notice:
        error instanceof Error
          ? error.message
          : 'Batch confirm failed. Check batch_quote_id and payment.',
      shot_count: stored.shot_count,
      jobs: [],
      clip_urls: [],
    };
  }

  const sceneIndexByShotId = new Map(
    stored.shots.map((s) => [s.shot_id, s.scene_index]),
  );

  const jobs: ConfirmBatchShotResult[] = [];
  for (const job of confirmJobs) {
    const sceneIndex = sceneIndexByShotId.get(job.shotId) ?? 0;
    const result = await enqueueShotJob(job, batchConfirmId, auth, sceneIndex);
    jobs.push(result);
  }

  const clipUrls = jobs
    .map((j) => j.output_video_url)
    .filter((url): url is string => Boolean(url));

  const alreadyStarted = jobs.filter(
    (j) =>
      j.error?.code === PIXELS_BATCH_ERROR_CODES.batch_shot_already_started,
  );

  return {
    mock: false,
    batch_quote_id: input.batch_quote_id,
    batch_confirm_id: batchConfirmId,
    status: 'jobs_started',
    notice:
      alreadyStarted.length > 0
        ? `Jobs started; ${alreadyStarted.length} shot(s) already in progress (409). Poll request_ids for remaining shots.`
        : clipUrls.length > 0
          ? 'Jobs started; some clips are ready. Poll via pixels-generate-task for remaining shots.'
          : 'Jobs started — clips are processing. No fake URLs returned; poll job request_ids for completion.',
    shot_count: stored.shot_count,
    jobs,
    clip_urls: clipUrls,
  };
}
