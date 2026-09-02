/// <reference types="node" />
/**
 * GCS workspace prefix for headless hydrate/dehydrate.
 */

import {getRendersBucketName} from './gcs.js';
import {resolveSessionId} from './provenance.js';

/** gs://{bucket}/workspaces/{tenant}/{session} */
export function buildWorkspaceGsPrefix(
  sessionId?: string,
  tenantId = 'director',
): string {
  const session = (sessionId ?? resolveSessionId()).trim();
  const tenant = tenantId.trim() || 'director';
  return `gs://${getRendersBucketName()}/workspaces/${tenant}/${session}`;
}
