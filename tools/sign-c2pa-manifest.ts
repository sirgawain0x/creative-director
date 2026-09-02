/// <reference types="node" />
/**
 * Phase 3A/3B/3C C2PA provenance — GCS sidecars + optional headless embed.
 */

import {resolveReadableMediaUrl, uploadVideoToGcs} from '../lib/gcs.js';
import {embedC2paOnHeadless} from '../lib/pixels-headless-client.js';
import {writeProvenanceSidecars} from '../lib/provenance.js';
import {isC2paEmbedConfigured} from '../lib/render-config.js';

export interface SignC2paManifestInput {
  master_video_url: string;
  creator_did: string;
  ai_models_used: string;
  clip_urls?: string[];
  project_title?: string;
}

export interface SignC2paManifestResult {
  mock: false;
  c2pa_status: 'unsigned' | 'pending_user_sign' | 'signed';
  cryptographically_signed: boolean;
  unsigned_master_url: string;
  signed_master_url?: string;
  provenance_manifest_url: string;
  ingredients_url: string;
  status_url: string;
  session_id: string;
  issuer: string;
  manifest_summary: {
    engine: string;
    provenance_standard: string;
    timestamp: string;
    clip_count: number;
  };
  next_step: string;
}

/** Record provenance metadata in GCS; optionally embed C2PA via headless. */
export async function signC2paManifest(
  input: SignC2paManifestInput,
): Promise<SignC2paManifestResult> {
  const written = await writeProvenanceSidecars(input);

  const baseResult = {
    mock: false as const,
    unsigned_master_url: input.master_video_url,
    provenance_manifest_url: written.provenance_manifest_url,
    ingredients_url: written.ingredients_url,
    status_url: written.status_url,
    session_id: written.session_id,
    issuer: written.manifest.creator_did,
    manifest_summary: {
      engine: input.ai_models_used,
      provenance_standard: written.manifest.provenance_standard,
      timestamp: written.manifest.created_at,
      clip_count: input.clip_urls?.length ?? 0,
    },
  };

  if (!isC2paEmbedConfigured()) {
    return {
      ...baseResult,
      c2pa_status: written.c2pa_status,
      cryptographically_signed: false,
      next_step: written.manifest.next_step,
    };
  }

  const readableMaster = await resolveReadableMediaUrl(input.master_video_url);
  const clipUrls = input.clip_urls ?? [];
  const ingredients = await Promise.all(
    clipUrls.map(async (url, index) => ({
      title: `scene_${index + 1}`,
      url: await resolveReadableMediaUrl(url),
    })),
  );

  const embedded = await embedC2paOnHeadless({
    masterUrl: readableMaster,
    creatorDid: input.creator_did,
    ingredients,
  });

  const slug =
    (input.project_title ?? 'master').toLowerCase().replace(/\s+/g, '_') ||
    'master';
  const signedUrl = await uploadVideoToGcs(
    embedded.buffer,
    `signed/${slug}_${Date.now()}.mp4`,
  );

  return {
    ...baseResult,
    c2pa_status: 'signed',
    cryptographically_signed: true,
    signed_master_url: signedUrl,
    next_step:
      'Master is cryptographically signed with C2PA. Distribute the signed master URL.',
  };
}
