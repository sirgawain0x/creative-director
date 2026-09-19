/**
 * HTTP client for Creative Pixels Generate APIs (edit-pixels).
 * Contract mirrors:
 *   POST /api/pixels-render-quote
 *   POST /api/pixels-render-veo
 *   POST /api/seedance-quote
 *   POST /api/seedance-generate
 *   GET  /api/pixels-generate-task?id=...
 */

import {randomUUID} from 'node:crypto';
import type {GenerateProvider} from './batch-render-quote.js';
import type {SeedanceAspectRatio, SeedanceResolution} from './seedance-pricing.js';

export class PixelsGenerateError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PixelsGenerateError';
  }
}

export interface PixelsGenerateAuth {
  accessToken: string;
  walletAddress?: string;
}

export interface StartVeoRenderInput {
  prompt: string;
  duration: number;
  aspectRatio?: string;
  requestId?: string;
  paymentTxHash?: string;
}

export interface StartSeedanceRenderInput {
  prompt: string;
  duration: number;
  aspectRatio?: SeedanceAspectRatio;
  resolution?: SeedanceResolution;
  quoteId?: string;
  requestId?: string;
  paymentTxHash?: string;
  generateAudio?: boolean;
}

export interface PixelsGenerateJobResult {
  request_id: string;
  provider: GenerateProvider;
  scene_index?: number;
  status: 'processing' | 'completed' | 'failed' | 'queued';
  progress: number;
  model?: string;
  veo_task_id?: string;
  output_video_url?: string;
  error?: {code: string; message: string; type?: string};
  cost_usdc6?: number;
  crtvai_required?: string;
}

function getBaseUrl(): string {
  const url =
    process.env.PIXELS_API_BASE_URL?.trim() ||
    process.env.PIXELS_GENERATE_API_URL?.trim();
  if (!url) {
    throw new Error('PIXELS_API_BASE_URL is not configured');
  }
  return url.replace(/\/$/, '');
}

export function isPixelsGenerateConfigured(): boolean {
  return Boolean(
    process.env.PIXELS_API_BASE_URL?.trim() ||
      process.env.PIXELS_GENERATE_API_URL?.trim(),
  );
}

function authHeaders(
  auth: PixelsGenerateAuth,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${auth.accessToken}`,
    ...extra,
  };
  const directorSecret = process.env.DIRECTOR_API_SECRET?.trim();
  if (directorSecret) {
    headers['x-director-secret'] = directorSecret;
  }
  return headers;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return {raw: text};
  }
}

function errorFrom(data: unknown, status: number): PixelsGenerateError {
  const payload = data as {error?: string; message?: string};
  const code = payload?.error ?? 'HTTP_ERROR';
  const message =
    payload?.message ??
    (typeof payload?.error === 'string'
      ? payload.error
      : `Pixels Generate request failed (${status})`);
  return new PixelsGenerateError(message, code, status);
}

async function pixelsJson<T>(
  route: string,
  init: RequestInit & {timeoutMs?: number} = {},
  auth: PixelsGenerateAuth,
): Promise<T> {
  const {timeoutMs = 120_000, ...fetchInit} = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getBaseUrl()}${route}`, {
      ...fetchInit,
      signal: controller.signal,
      headers: authHeaders(
        auth,
        (fetchInit.headers as Record<string, string> | undefined) ?? {},
      ),
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw errorFrom(data, response.status);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function quotePixelsDualRender(
  auth: PixelsGenerateAuth,
  duration: number,
): Promise<{
  veo: {estimatedUsdc6: number; crtvaiRequired: string};
  seedance: {quoteId: string; estimatedUsdc6: number; crtvaiRequired: string};
}> {
  const body: Record<string, unknown> = {duration};
  if (auth.walletAddress) body.walletAddress = auth.walletAddress;

  const data = await pixelsJson<{
    veo: {estimatedUsdc6: number; crtvaiRequired: string};
    seedance: {quoteId: string; estimatedUsdc6: number; crtvaiRequired: string};
  }>('/api/pixels-render-quote', {method: 'POST', body: JSON.stringify(body)}, auth);

  return data;
}

export async function startVeoRender(
  auth: PixelsGenerateAuth,
  input: StartVeoRenderInput,
): Promise<PixelsGenerateJobResult> {
  const requestId = input.requestId ?? randomUUID();
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: input.duration,
    aspect_ratio: input.aspectRatio ?? '16:9',
    requestId,
  };
  if (auth.walletAddress) body.walletAddress = auth.walletAddress;
  if (input.paymentTxHash) body.paymentTxHash = input.paymentTxHash;

  const data = await pixelsJson<{
    id: string;
    status: string;
    progress: number;
    model?: string;
    pixelsRequestId?: string;
    costUsdc6?: number;
    crtvaiRequired?: string;
  }>(
    '/api/pixels-render-veo',
    {method: 'POST', body: JSON.stringify(body), timeoutMs: 300_000},
    auth,
  );

  return {
    request_id: data.pixelsRequestId ?? requestId,
    provider: 'veo',
    status: data.status === 'failed' ? 'failed' : 'processing',
    progress: data.progress ?? 0,
    model: data.model,
    veo_task_id: data.id,
    cost_usdc6: data.costUsdc6,
    crtvai_required: data.crtvaiRequired,
  };
}

export async function startSeedanceRender(
  auth: PixelsGenerateAuth,
  input: StartSeedanceRenderInput,
): Promise<PixelsGenerateJobResult> {
  const requestId = input.requestId ?? randomUUID();
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: input.duration,
    aspect_ratio: input.aspectRatio ?? '16:9',
    resolution: input.resolution ?? '720p',
    requestId,
    generate_audio: input.generateAudio !== false,
  };
  if (input.quoteId) body.quoteId = input.quoteId;
  if (auth.walletAddress) body.walletAddress = auth.walletAddress;
  if (input.paymentTxHash) body.paymentTxHash = input.paymentTxHash;

  const data = await pixelsJson<{
    id: string;
    status: string;
    progress: number;
    model?: string;
    output?: {video_url?: string};
    costUsdc6?: number;
    crtvaiRequired?: string;
    error?: {code: string; message: string; type?: string};
  }>(
    '/api/seedance-generate',
    {method: 'POST', body: JSON.stringify(body), timeoutMs: 600_000},
    auth,
  );

  const status =
    data.status === 'completed'
      ? 'completed'
      : data.status === 'failed'
        ? 'failed'
        : 'processing';

  return {
    request_id: requestId,
    provider: 'seedance',
    status,
    progress: data.progress ?? (status === 'completed' ? 100 : 0),
    model: data.model,
    output_video_url: data.output?.video_url,
    cost_usdc6: data.costUsdc6,
    crtvai_required: data.crtvaiRequired,
    error: data.error,
  };
}

export async function pollGenerateTask(
  auth: PixelsGenerateAuth,
  requestId: string,
): Promise<PixelsGenerateJobResult> {
  const walletQuery = auth.walletAddress
    ? `&wallet=${encodeURIComponent(auth.walletAddress)}`
    : '';
  const data = await pixelsJson<{
    id: string;
    status: string;
    progress: number;
    model?: string;
    veoTaskId?: string;
    output?: {video_url?: string};
    error?: {code: string; message: string; type?: string};
    costUsdc6?: number;
    crtvaiRequired?: string;
  }>(
    `/api/pixels-generate-task?id=${encodeURIComponent(requestId)}${walletQuery}`,
    {method: 'GET'},
    auth,
  );

  const status =
    data.status === 'completed'
      ? 'completed'
      : data.status === 'failed'
        ? 'failed'
        : 'processing';

  return {
    request_id: data.id,
    provider: data.veoTaskId ? 'veo' : 'seedance',
    status,
    progress: data.progress ?? 0,
    model: data.model,
    veo_task_id: data.veoTaskId,
    output_video_url: data.output?.video_url,
    error: data.error,
    cost_usdc6: data.costUsdc6,
    crtvai_required: data.crtvaiRequired,
  };
}
