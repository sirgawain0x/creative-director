/// <reference types="node" />
/**
 * HTTP client for the Pixels headless render service (edit-pixels headless/serve.mjs).
 */

import {randomUUID} from 'node:crypto';

export interface MediaResource {
  id: string;
  revision: string;
  metadata: {
    duration?: number;
    fps?: number;
    mimeType?: string;
    width?: number;
    height?: number;
  };
}

export interface ProjectResource {
  id: string;
  revision: string;
  project: {id: string; name: string; metadata?: {fps?: number}};
}

export interface EditResult {
  revision: string;
  persisted: boolean;
  project?: {duration?: number};
}

export interface RenderResult {
  buffer: Buffer;
  contentType: string;
}

export interface WorkspaceSyncResult {
  direction: 'hydrate' | 'dehydrate';
  gs_prefix: string;
  files: number;
}

export interface C2paEmbedResult {
  buffer: Buffer;
  contentType: string;
}

export class PixelsHeadlessError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PixelsHeadlessError';
  }
}

function getBaseUrl(): string {
  const url = process.env.PIXELS_HEADLESS_URL?.trim();
  if (!url) {
    throw new Error('PIXELS_HEADLESS_URL is not configured');
  }
  return url.replace(/\/$/, '');
}

function getApiKey(): string | undefined {
  return process.env.PIXELS_HEADLESS_API_KEY?.trim() || undefined;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  const apiKey = getApiKey();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
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

function errorFrom(data: unknown, status: number): PixelsHeadlessError {
  const payload = data as {error?: {code?: string; message?: string}};
  const code = payload?.error?.code ?? 'HTTP_ERROR';
  const message =
    payload?.error?.message ?? `Pixels headless request failed (${status})`;
  return new PixelsHeadlessError(message, code, status);
}

async function pixelsJson<T>(
  route: string,
  init: RequestInit & {timeoutMs?: number} = {},
): Promise<T> {
  const {timeoutMs = 120_000, ...fetchInit} = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getBaseUrl()}${route}`, {
      ...fetchInit,
      signal: controller.signal,
      headers: authHeaders(
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

export async function createHeadlessProject(input: {
  id: string;
  name: string;
  width?: number;
  height?: number;
  fps?: number;
}): Promise<ProjectResource> {
  return pixelsJson<ProjectResource>('/v1/projects', {
    method: 'POST',
    headers: {'Idempotency-Key': `cd-create-${randomUUID()}`},
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      width: input.width ?? 1920,
      height: input.height ?? 1080,
      fps: input.fps ?? 30,
      backgroundColor: '#000000',
    }),
  });
}

export async function importMediaFromUrl(input: {
  url: string;
  id: string;
  projectId: string;
}): Promise<MediaResource> {
  return pixelsJson<MediaResource>('/v1/media/import-url', {
    method: 'POST',
    body: JSON.stringify({
      url: input.url,
      id: input.id,
      project: input.projectId,
    }),
    timeoutMs: 600_000,
  });
}

export async function editHeadlessProject(input: {
  projectId: string;
  ops: Record<string, unknown>[];
  expectedRevision: string;
}): Promise<EditResult> {
  return pixelsJson<EditResult>(
    `/v1/projects/${encodeURIComponent(input.projectId)}/edit`,
    {
      method: 'POST',
      headers: {'Idempotency-Key': `cd-edit-${randomUUID()}`},
      body: JSON.stringify({
        ops: input.ops,
        persist: true,
        expectedRevision: input.expectedRevision,
      }),
      timeoutMs: 300_000,
    },
  );
}

export async function renderHeadlessProject(input: {
  projectId: string;
  codec?: string;
  container?: string;
  quality?: string;
}): Promise<RenderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30 * 60_000);

  try {
    const response = await fetch(`${getBaseUrl()}/v1/render`, {
      method: 'POST',
      signal: controller.signal,
      headers: authHeaders(),
      body: JSON.stringify({
        project: input.projectId,
        codec: input.codec ?? 'h264',
        container: input.container ?? 'mp4',
        quality: input.quality ?? 'high',
      }),
    });

    if (!response.ok) {
      const data = await parseJsonResponse(response);
      throw errorFrom(data, response.status);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'video/mp4',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function syncHeadlessWorkspace(input: {
  direction: 'hydrate' | 'dehydrate';
  gsPrefix: string;
}): Promise<WorkspaceSyncResult> {
  const data = await pixelsJson<{
    direction: 'hydrate' | 'dehydrate';
    gs_prefix: string;
    files: number;
  }>('/v1/workspace/sync', {
    method: 'POST',
    body: JSON.stringify({
      direction: input.direction,
      gs_prefix: input.gsPrefix,
    }),
    timeoutMs: 600_000,
  });
  return {
    direction: data.direction,
    gs_prefix: data.gs_prefix,
    files: data.files,
  };
}

export async function embedC2paOnHeadless(input: {
  masterUrl: string;
  creatorDid: string;
  ingredients?: Array<{title: string; url: string}>;
  certId?: string;
}): Promise<C2paEmbedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30 * 60_000);

  try {
    const response = await fetch(`${getBaseUrl()}/v1/c2pa/embed`, {
      method: 'POST',
      signal: controller.signal,
      headers: authHeaders(),
      body: JSON.stringify({
        master_url: input.masterUrl,
        creator_did: input.creatorDid,
        ...(input.ingredients?.length ? {ingredients: input.ingredients} : {}),
        ...(input.certId ? {cert_id: input.certId} : {}),
      }),
    });

    if (!response.ok) {
      const data = await parseJsonResponse(response);
      throw errorFrom(data, response.status);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'video/mp4',
    };
  } finally {
    clearTimeout(timer);
  }
}
