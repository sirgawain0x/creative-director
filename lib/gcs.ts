/// <reference types="node" />
/**
 * GCS upload helpers for rendered video clips.
 */

import {Storage} from '@google-cloud/storage';

/** Matches Terraform: `{project_id}-creative-pixels-renders` */
function defaultRendersBucket(): string {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (project) return `${project}-creative-pixels-renders`;
  return 'creative-ai-491118-creative-pixels-renders';
}

function getRendersBucket(): string {
  return process.env.RENDERS_GCS_BUCKET?.trim() || defaultRendersBucket();
}

/** Upload a video buffer and return its public HTTPS URL. */
export async function uploadVideoToGcs(
  buffer: Buffer,
  objectPath: string,
): Promise<string> {
  const bucketName = getRendersBucket();
  const storage = new Storage();
  const file = storage.bucket(bucketName).file(objectPath);

  await file.save(buffer, {
    contentType: 'video/mp4',
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  });

  return `https://storage.googleapis.com/${bucketName}/${objectPath}`;
}

/** Upload a JSON document and return its public HTTPS URL. */
export async function uploadJsonToGcs(
  objectPath: string,
  value: unknown,
): Promise<string> {
  const bucketName = getRendersBucket();
  const storage = new Storage();
  const file = storage.bucket(bucketName).file(objectPath);

  await file.save(JSON.stringify(value, null, 2), {
    contentType: 'application/json',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });

  return `https://storage.googleapis.com/${bucketName}/${objectPath}`;
}

/** Map a storage.googleapis.com URL to gs:// when it targets the renders bucket. */
export function toGsUri(httpsUrl: string): string | null {
  const match = /^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/.exec(
    httpsUrl.trim(),
  );
  if (!match) return null;
  const [, bucket, objectPath] = match;
  if (bucket !== getRendersBucket()) return null;
  return `gs://${bucket}/${decodeURIComponent(objectPath)}`;
}

export function getRendersBucketName(): string {
  return getRendersBucket();
}

/** Signed HTTPS URL so headless can download private objects in the renders bucket. */
export async function resolveReadableMediaUrl(url: string): Promise<string> {
  const match = /^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/.exec(url.trim());
  if (!match) return url;

  const [, bucket, objectPath] = match;
  if (bucket !== getRendersBucket()) return url;

  const storage = new Storage();
  const [signedUrl] = await storage
    .bucket(bucket)
    .file(decodeURIComponent(objectPath))
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
  return signedUrl;
}
