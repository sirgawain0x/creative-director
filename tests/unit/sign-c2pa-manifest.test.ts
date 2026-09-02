import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWriteProvenance = vi.fn();
const mockEmbedC2pa = vi.fn();
const mockResolveReadable = vi.fn();
const mockUpload = vi.fn();

vi.mock('../../lib/provenance.js', () => ({
  writeProvenanceSidecars: (...args: unknown[]) => mockWriteProvenance(...args),
}));

vi.mock('../../lib/pixels-headless-client.js', () => ({
  embedC2paOnHeadless: (...args: unknown[]) => mockEmbedC2pa(...args),
}));

vi.mock('../../lib/gcs.js', () => ({
  resolveReadableMediaUrl: (...args: unknown[]) => mockResolveReadable(...args),
  uploadVideoToGcs: (...args: unknown[]) => mockUpload(...args),
}));

vi.mock('../../lib/render-config.js', () => ({
  isC2paEmbedConfigured: vi.fn(() => false),
}));

import {signC2paManifest} from '../../tools/sign-c2pa-manifest.js';
import {isC2paEmbedConfigured} from '../../lib/render-config.js';

describe('signC2paManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isC2paEmbedConfigured).mockReturnValue(false);
    mockResolveReadable.mockImplementation(async (url: string) => url);
    mockWriteProvenance.mockResolvedValue({
      session_id: 'cd_test-session',
      c2pa_status: 'pending_user_sign',
      provenance_manifest_url:
        'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/provenance/cd_test-session/manifest.json',
      ingredients_url:
        'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/provenance/cd_test-session/ingredients.json',
      status_url:
        'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/provenance/cd_test-session/status.json',
      manifest: {
        creator_did: 'did:ethr:0xabc',
        provenance_standard: 'C2PA v2.1',
        created_at: '2026-09-01T00:00:00.000Z',
        next_step: 'Open in Creative Pixels',
      },
    });
  });

  it('returns real provenance metadata without mock: true', async () => {
    const result = await signC2paManifest({
      master_video_url:
        'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/masters/demo.mp4',
      creator_did: '0xabc',
      ai_models_used: 'Gemini 3.5 Flash, Veo 3.1',
      clip_urls: ['https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/cuts/scene_1.mp4'],
      project_title: 'Demo',
    });

    expect(result).toMatchObject({
      mock: false,
      cryptographically_signed: false,
      c2pa_status: 'pending_user_sign',
      session_id: 'cd_test-session',
      issuer: 'did:ethr:0xabc',
    });
    expect(result.provenance_manifest_url).toMatch(/provenance\/cd_test-session\/manifest\.json$/);
    expect(mockWriteProvenance).toHaveBeenCalledOnce();
    expect(mockEmbedC2pa).not.toHaveBeenCalled();
  });

  it('embeds C2PA and uploads signed master when headless embed is enabled', async () => {
    vi.mocked(isC2paEmbedConfigured).mockReturnValue(true);
    mockEmbedC2pa.mockResolvedValue({
      buffer: Buffer.from('signed-mp4'),
      contentType: 'video/mp4',
    });
    mockUpload.mockResolvedValue(
      'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/signed/demo.mp4',
    );

    const result = await signC2paManifest({
      master_video_url:
        'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/masters/demo.mp4',
      creator_did: '0xabc',
      ai_models_used: 'Gemini 3.5 Flash, Veo 3.1',
      clip_urls: ['https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/cuts/scene_1.mp4'],
      project_title: 'Demo',
    });

    expect(result).toMatchObject({
      mock: false,
      cryptographically_signed: true,
      c2pa_status: 'signed',
      signed_master_url: expect.stringMatching(/\/signed\//),
    });
    expect(mockEmbedC2pa).toHaveBeenCalledOnce();
    expect(mockUpload).toHaveBeenCalledOnce();
    expect(mockResolveReadable).toHaveBeenCalledTimes(2);
  });
});
