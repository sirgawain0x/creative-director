/// <reference types="node" />
/**
 * Production video cut pipeline: Gemini still → Veo i2v → GCS upload.
 */

import {uploadVideoToGcs} from '../lib/gcs.js';
import {
  clampFlowDuration,
  type VeoTier,
} from '../lib/generative-pricing.js';
import {
  generateGeminiImage,
  startVeoVideo,
  waitForVeoVideo,
} from '../lib/vertex-generative.js';

export interface GenerateVideoCutInput {
  scene_index: number;
  timestamp_start: string;
  timestamp_end: string;
  duration_seconds: number;
  visual_prompt: string;
  camera_movement: string;
}

export interface GenerateVideoCutResult {
  mock: false;
  status: 'rendered';
  scene_index: number;
  timecode: string;
  clip_url: string;
  prompt: string;
  veo_model?: string;
}

function buildStillPrompt(visualPrompt: string, cameraMovement: string): string {
  return `${visualPrompt.trim()}. Camera: ${cameraMovement.trim()}. Cinematic music video still, 16:9, high detail.`;
}

function buildVideoPrompt(visualPrompt: string, cameraMovement: string): string {
  return `${visualPrompt.trim()}. Camera movement: ${cameraMovement.trim()}. Smooth cinematic motion, music video aesthetic.`;
}

async function resolveVideoBuffer(
  pollResult: Awaited<ReturnType<typeof waitForVeoVideo>>,
): Promise<Buffer> {
  if (pollResult.videoBase64) {
    return Buffer.from(pollResult.videoBase64, 'base64');
  }
  if (pollResult.videoUri) {
    const response = await fetch(pollResult.videoUri);
    if (!response.ok) {
      throw new Error(`Failed to fetch Veo output (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error(pollResult.errorMessage ?? 'Veo returned no video data');
}

function parseVeoTier(): VeoTier {
  const raw = process.env.VEO_TIER?.toLowerCase();
  if (raw === 'fast' || raw === 'lite') return raw;
  return 'standard';
}

/** Render one scene cut via Gemini + Veo and upload to GCS. */
export async function generateVideoCut(
  input: GenerateVideoCutInput,
): Promise<GenerateVideoCutResult> {
  const {
    scene_index,
    timestamp_start,
    timestamp_end,
    duration_seconds,
    visual_prompt,
    camera_movement,
  } = input;

  const stillPrompt = buildStillPrompt(visual_prompt, camera_movement);
  const still = await generateGeminiImage(stillPrompt, {
    quality: '2K',
    aspectRatio: '16:9',
  });

  const startImage = {
    bytes: Buffer.from(still.base64, 'base64'),
    mimeType: still.mimeType,
  };

  const videoPrompt = buildVideoPrompt(visual_prompt, camera_movement);
  const tier = parseVeoTier();
  const quality =
    process.env.VEO_QUALITY === '1080p' || process.env.VEO_QUALITY === '4K'
      ? process.env.VEO_QUALITY
      : '720p';

  const started = await startVeoVideo({
    tier,
    prompt: videoPrompt,
    startImage,
    endImage: startImage,
    duration: clampFlowDuration(duration_seconds),
    quality,
    aspectRatio: '16:9',
  });

  const pollResult = await waitForVeoVideo(
    started.operationName,
    started.modelId,
  );

  if (pollResult.status === 'failed') {
    throw new Error(pollResult.errorMessage ?? 'Veo video generation failed');
  }

  const videoBuffer = await resolveVideoBuffer(pollResult);
  const timestamp = Date.now();
  const objectPath = `cuts/scene_${scene_index}_${timestamp}.mp4`;
  const clipUrl = await uploadVideoToGcs(videoBuffer, objectPath);

  return {
    mock: false,
    status: 'rendered',
    scene_index,
    timecode: `${timestamp_start} - ${timestamp_end}`,
    clip_url: clipUrl,
    prompt: videoPrompt,
    veo_model: started.modelId,
  };
}
