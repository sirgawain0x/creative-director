/// <reference types="node" />
/**
 * Vertex / Google Cloud auth via Application Default Credentials (ADC).
 * Used on Agent Engine and local dev with `gcloud auth application-default login`.
 */

import {GoogleAuth} from 'google-auth-library';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const DEFAULT_PROJECT = 'creative-ai-491118';
const DEFAULT_LOCATION = 'us-central1';

export function getVertexProject(): string {
  return (
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCP_PROJECT_ID?.trim() ||
    DEFAULT_PROJECT
  );
}

export function getVertexLocation(): string {
  return process.env.VERTEX_LOCATION?.trim() || DEFAULT_LOCATION;
}

function tokenFromResponse(tokenResponse: unknown): string | null {
  if (typeof tokenResponse === 'string' && tokenResponse) return tokenResponse;
  if (
    tokenResponse &&
    typeof tokenResponse === 'object' &&
    'token' in tokenResponse &&
    typeof (tokenResponse as {token?: unknown}).token === 'string'
  ) {
    return (tokenResponse as {token: string}).token;
  }
  return null;
}

export async function getVertexAccessToken(): Promise<string> {
  const auth = new GoogleAuth({scopes: [CLOUD_PLATFORM_SCOPE]});
  const client = await auth.getClient();
  const token = tokenFromResponse(await client.getAccessToken());
  if (!token) {
    throw new Error('Failed to obtain Google Cloud access token via ADC');
  }
  return token;
}

export function isVertexAuthConfigured(): boolean {
  return Boolean(getVertexProject());
}
