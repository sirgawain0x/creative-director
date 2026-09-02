/// <reference types="node" />
/**
 * Production timeline assembly: Pixels headless import → edit → render → GCS upload.
 */

import {resolveReadableMediaUrl, uploadVideoToGcs} from '../lib/gcs.js';
import {
  createHeadlessProject,
  editHeadlessProject,
  importMediaFromUrl,
  renderHeadlessProject,
  syncHeadlessWorkspace,
  type MediaResource,
} from '../lib/pixels-headless-client.js';
import {isWorkspaceSyncConfigured} from '../lib/render-config.js';
import {buildWorkspaceGsPrefix} from '../lib/workspace-path.js';
import {resolveSessionId} from '../lib/provenance.js';

export interface AssembleTimelineInput {
  project_title: string;
  clip_urls: string[];
  audio_uri: string;
  target_bpm?: number;
}

export interface AssembleTimelineResult {
  mock: false;
  status: 'assembled';
  project: string;
  project_id: string;
  total_cuts: number;
  master_timeline_url: string;
  target_bpm?: number;
  workspace_gs_prefix?: string;
}

const DEFAULT_FPS = 30;

function slugifyProjectId(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'master';
  return `${base}_${Date.now().toString(36)}`;
}

function durationInFrames(
  media: MediaResource,
  fps: number,
  fallbackSeconds = 5,
): number {
  const seconds = media.metadata?.duration ?? fallbackSeconds;
  return Math.max(1, Math.round(seconds * fps));
}

function buildTimelineOps(
  clipMedia: MediaResource[],
  audioMedia: MediaResource,
  fps: number,
): Record<string, unknown>[] {
  const ops: Record<string, unknown>[] = [
    {callerId: 'video_track', op: 'addTrack', kind: 'video'},
    {callerId: 'audio_track', op: 'addTrack', kind: 'audio'},
  ];

  let frameOffset = 0;
  for (let index = 0; index < clipMedia.length; index++) {
    const media = clipMedia[index]!;
    const durationInFramesValue = durationInFrames(media, fps);
    ops.push({
      callerId: `clip_${index}`,
      op: 'addClip',
      mediaId: media.id,
      from: frameOffset,
      durationInFrames: durationInFramesValue,
    });
    frameOffset += durationInFramesValue;
  }

  const timelineSeconds = frameOffset / fps;
  const audioSeconds = audioMedia.metadata?.duration ?? timelineSeconds;
  const audioFrames = Math.max(
    frameOffset,
    durationInFrames(audioMedia, fps, audioSeconds),
  );

  ops.push({
    callerId: 'audio_clip',
    op: 'addClip',
    mediaId: audioMedia.id,
    from: 0,
    durationInFrames: audioFrames,
  });

  return ops;
}

/** Stitch clip URLs + master audio via Pixels headless and upload master MP4 to GCS. */
export async function assembleAndSyncTimeline(
  input: AssembleTimelineInput,
): Promise<AssembleTimelineResult> {
  const {project_title, clip_urls, audio_uri, target_bpm} = input;

  if (!clip_urls.length) {
    throw new Error('assemble_and_sync_timeline requires at least one clip URL');
  }

  const projectId = slugifyProjectId(project_title);
  const fps = DEFAULT_FPS;

  const created = await createHeadlessProject({
    id: projectId,
    name: project_title,
    fps,
  });

  const clipMedia: MediaResource[] = [];
  for (let index = 0; index < clip_urls.length; index++) {
    const downloadUrl = await resolveReadableMediaUrl(clip_urls[index]!);
    const imported = await importMediaFromUrl({
      url: downloadUrl,
      id: `clip_${index}`,
      projectId,
    });
    clipMedia.push(imported);
  }

  const audioDownloadUrl = await resolveReadableMediaUrl(audio_uri);
  const audioMedia = await importMediaFromUrl({
    url: audioDownloadUrl,
    id: 'audio_master',
    projectId,
  });

  const ops = buildTimelineOps(clipMedia, audioMedia, fps);
  await editHeadlessProject({
    projectId,
    ops,
    expectedRevision: created.revision,
  });

  const rendered = await renderHeadlessProject({projectId});
  const slug = project_title.toLowerCase().replace(/\s+/g, '_');
  const objectPath = `masters/${slug}_${Date.now()}.mp4`;
  const masterUrl = await uploadVideoToGcs(rendered.buffer, objectPath);

  let workspaceGsPrefix: string | undefined;
  if (isWorkspaceSyncConfigured()) {
    const sessionId = resolveSessionId();
    workspaceGsPrefix = buildWorkspaceGsPrefix(sessionId);
    await syncHeadlessWorkspace({
      direction: 'dehydrate',
      gsPrefix: workspaceGsPrefix,
    });
  }

  return {
    mock: false,
    status: 'assembled',
    project: project_title,
    project_id: projectId,
    total_cuts: clip_urls.length,
    master_timeline_url: masterUrl,
    ...(target_bpm !== undefined ? {target_bpm} : {}),
    ...(workspaceGsPrefix ? {workspace_gs_prefix: workspaceGsPrefix} : {}),
  };
}
