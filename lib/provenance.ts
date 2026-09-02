/// <reference types="node" />
/**
 * C2PA provenance sidecars in GCS (Phase 3A/3B).
 * Cryptographic signing happens in Creative Pixels UI or headless embed (Phase 3C).
 */

import {randomUUID} from 'node:crypto';
import {getRendersBucketName, uploadJsonToGcs, toGsUri} from './gcs.js';

export const PROVENANCE_SCHEMA_VERSION = '1.0';

export type ProvenanceMode = 'unsigned' | 'handoff';

export interface ProvenanceManifest {
  schema_version: string;
  session_id: string;
  created_at: string;
  creator_did: string;
  ai_models_used: string;
  unsigned_master_url: string;
  unsigned_master_gs: string;
  clip_urls: string[];
  project_title?: string;
  provenance_standard: string;
  c2pa_status: 'unsigned' | 'pending_user_sign';
  actions: Array<{action: string; softwareAgent: string}>;
  next_step: string;
}

export interface ProvenanceStatus {
  phase: 'published';
  c2pa_status: 'unsigned' | 'pending_user_sign';
  unsigned_master_url: string;
  unsigned_master_gs: string;
  provenance_manifest_url: string;
  ingredients_url: string;
  creator_did: string;
  updated_at: string;
}

export interface ProvenanceIngredient {
  title: string;
  url: string;
  gs_uri?: string;
  relationship: 'componentOf';
}

function normalizeCreatorDid(creatorDid: string): string {
  const trimmed = creatorDid.trim();
  if (trimmed.startsWith('did:')) return trimmed;
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return `did:ethr:${trimmed}`;
  }
  return trimmed;
}

export function resolveProvenanceMode(): ProvenanceMode {
  const raw = process.env.C2PA_PROVENANCE_MODE?.toLowerCase();
  return raw === 'unsigned' ? 'unsigned' : 'handoff';
}

export function resolveSessionId(): string {
  return (
    process.env.CREATIVE_DIRECTOR_SESSION_ID?.trim() ||
    process.env.AGENT_ENGINE_SESSION_ID?.trim() ||
    `cd_${randomUUID()}`
  );
}

function buildIngredients(
  clipUrls: string[],
  masterUrl: string,
): ProvenanceIngredient[] {
  const clips = clipUrls.map((url, index) => ({
    title: `scene_${index + 1}`,
    url,
    gs_uri: toGsUri(url) ?? undefined,
    relationship: 'componentOf' as const,
  }));

  return [
    ...clips,
    {
      title: 'master_timeline',
      url: masterUrl,
      gs_uri: toGsUri(masterUrl) ?? undefined,
      relationship: 'componentOf' as const,
    },
  ];
}

export interface WriteProvenanceInput {
  master_video_url: string;
  creator_did: string;
  ai_models_used: string;
  clip_urls?: string[];
  project_title?: string;
  session_id?: string;
}

export interface WriteProvenanceResult {
  session_id: string;
  c2pa_status: 'unsigned' | 'pending_user_sign';
  provenance_manifest_url: string;
  ingredients_url: string;
  status_url: string;
  manifest: ProvenanceManifest;
}

/** Write provenance sidecars under provenance/{session_id}/ in the renders bucket. */
export async function writeProvenanceSidecars(
  input: WriteProvenanceInput,
): Promise<WriteProvenanceResult> {
  const sessionId = input.session_id ?? resolveSessionId();
  const mode = resolveProvenanceMode();
  const c2paStatus: ProvenanceManifest['c2pa_status'] =
    mode === 'handoff' ? 'pending_user_sign' : 'unsigned';

  const creatorDid = normalizeCreatorDid(input.creator_did);
  const clipUrls = input.clip_urls ?? [];
  const masterGs = toGsUri(input.master_video_url) ?? input.master_video_url;
  const now = new Date().toISOString();

  const manifest: ProvenanceManifest = {
    schema_version: PROVENANCE_SCHEMA_VERSION,
    session_id: sessionId,
    created_at: now,
    creator_did: creatorDid,
    ai_models_used: input.ai_models_used,
    unsigned_master_url: input.master_video_url,
    unsigned_master_gs: masterGs,
    clip_urls: clipUrls,
    ...(input.project_title ? {project_title: input.project_title} : {}),
    provenance_standard: 'C2PA v2.1',
    c2pa_status: c2paStatus,
    actions: [
      {
        action: 'c2pa.created',
        softwareAgent: 'Creative Director AI',
      },
      {
        action: 'c2pa.edited',
        softwareAgent: 'Creative Director AI',
      },
    ],
    next_step:
      mode === 'handoff'
        ? 'Open the unsigned master in Creative Pixels to complete C2PA signing with your wallet.'
        : 'Master is unsigned. Complete C2PA signing in Creative Pixels when ready.',
  };

  const ingredients = buildIngredients(clipUrls, input.master_video_url);

  const prefix = `provenance/${sessionId}`;
  const manifestUrl = await uploadJsonToGcs(`${prefix}/manifest.json`, manifest);
  const ingredientsUrl = await uploadJsonToGcs(`${prefix}/ingredients.json`, {
    schema_version: PROVENANCE_SCHEMA_VERSION,
    session_id: sessionId,
    ingredients,
  });

  const status: ProvenanceStatus = {
    phase: 'published',
    c2pa_status: c2paStatus,
    unsigned_master_url: input.master_video_url,
    unsigned_master_gs: masterGs,
    provenance_manifest_url: manifestUrl,
    ingredients_url: ingredientsUrl,
    creator_did: creatorDid,
    updated_at: now,
  };

  const statusUrl = await uploadJsonToGcs(`${prefix}/status.json`, status);

  return {
    session_id: sessionId,
    c2pa_status: c2paStatus,
    provenance_manifest_url: manifestUrl,
    ingredients_url: ingredientsUrl,
    status_url: statusUrl,
    manifest,
  };
}

export function getProvenanceBucketPrefix(sessionId: string): string {
  return `gs://${getRendersBucketName()}/provenance/${sessionId}`;
}
