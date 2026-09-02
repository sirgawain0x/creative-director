import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../../lib/gcs.js', () => ({
  getRendersBucketName: () => 'creative-ai-491118-creative-pixels-renders',
}));

import {buildWorkspaceGsPrefix} from '../../lib/workspace-path.js';

describe('buildWorkspaceGsPrefix', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the production renders bucket and session id', () => {
    expect(buildWorkspaceGsPrefix('cd_abc123')).toBe(
      'gs://creative-ai-491118-creative-pixels-renders/workspaces/director/cd_abc123',
    );
  });

  it('supports custom tenant id', () => {
    expect(buildWorkspaceGsPrefix('cd_abc123', 'acme')).toBe(
      'gs://creative-ai-491118-creative-pixels-renders/workspaces/acme/cd_abc123',
    );
  });
});
