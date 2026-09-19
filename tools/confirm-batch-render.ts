/**
 * Confirms a batch quote and starts Pixels Generate jobs — real spend path.
 */

import {randomUUID} from 'node:crypto';
import {
  getStoredBatchQuote,
  type BatchShotQuote,
} from '../lib/batch-render-quote.js';
import {
  isPixelsGenerateConfigured,
  pollGenerateTask,
  startSeedanceRender,
  startVeoRender,
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
  status: 'jobs_started' | 'rejected' | 'error';
  notice: string;
  shot_count: number;
  jobs: ConfirmBatchShotResult[];
  clip_urls: string[];
}

async function startShotJob(
  shot: BatchShotQuote,
  auth: PixelsGenerateAuth,
  paymentTxHash?: string,
): Promise<ConfirmBatchShotResult> {
  const requestId = `cd-shot-${shot.scene_index}-${randomUUID()}`;

  if (shot.provider === 'seedance') {
    const result = await startSeedanceRender(auth, {
      prompt: shot.prompt,
      duration: shot.duration_seconds,
      aspectRatio: shot.aspect_ratio,
      resolution: shot.resolution,
      quoteId: shot.seedance_quote_id,
      requestId,
      paymentTxHash,
    });
    return {
      scene_index: shot.scene_index,
      provider: shot.provider,
      request_id: result.request_id,
      status: result.status,
      progress: result.progress,
      model: result.model,
      output_video_url: result.output_video_url,
      error: result.error,
    };
  }

  const result = await startVeoRender(auth, {
    prompt: shot.prompt,
    duration: shot.duration_seconds,
    aspectRatio: shot.aspect_ratio,
    requestId,
    paymentTxHash,
  });

  let outputUrl = result.output_video_url;
  if (!outputUrl && result.status === 'processing' && result.veo_task_id) {
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
    scene_index: shot.scene_index,
    provider: shot.provider,
    request_id: result.request_id,
    status: result.status,
    progress: result.progress,
    model: result.model,
    veo_task_id: result.veo_task_id,
    output_video_url: outputUrl,
    error: result.error,
  };
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

  const jobs: ConfirmBatchShotResult[] = [];
  for (const shot of stored.shots) {
    const job = await startShotJob(shot, auth, input.payment_tx_hash);
    jobs.push(job);
  }

  const clipUrls = jobs
    .map((j) => j.output_video_url)
    .filter((url): url is string => Boolean(url));

  return {
    mock: false,
    batch_quote_id: input.batch_quote_id,
    status: 'jobs_started',
    notice:
      clipUrls.length > 0
        ? 'Jobs started; some clips are ready. Poll via pixels-generate-task for remaining shots.'
        : 'Jobs started — clips are processing. No fake URLs returned; poll job request_ids for completion.',
    shot_count: stored.shot_count,
    jobs,
    clip_urls: clipUrls,
  };
}
