import {describe, expect, it, vi} from 'vitest';

const mockUpload = vi.fn();

vi.mock('../../lib/gcs.js', () => ({
  uploadJsonToGcs: (...args: unknown[]) => mockUpload(...args),
  getRendersBucketName: () => 'creative-ai-491118-creative-pixels-renders',
  toGsUri: (url: string) => {
    const m = /^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/.exec(url);
    return m ? `gs://${m[1]}/${m[2]}` : null;
  },
}));

import {writeProvenanceSidecars} from '../../lib/provenance.js';

describe('writeProvenanceSidecars', () => {
  it('writes manifest, ingredients, and status objects', async () => {
    mockUpload.mockImplementation(async (path: string) =>
      `https://storage.googleapis.com/bucket/${path}`,
    );

    const result = await writeProvenanceSidecars({
      master_video_url:
        'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/masters/x.mp4',
      creator_did: 'did:ethr:0x1',
      ai_models_used: 'Veo',
      clip_urls: ['https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/cuts/a.mp4'],
      session_id: 'sess_1',
    });

    expect(result.c2pa_status).toBe('pending_user_sign');
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(mockUpload.mock.calls.map((c) => c[0])).toEqual([
      'provenance/sess_1/manifest.json',
      'provenance/sess_1/ingredients.json',
      'provenance/sess_1/status.json',
    ]);
  });
});
