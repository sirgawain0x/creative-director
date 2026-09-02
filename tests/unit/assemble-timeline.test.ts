import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockCreateProject = vi.fn();
const mockImportMedia = vi.fn();
const mockEditProject = vi.fn();
const mockRenderProject = vi.fn();
const mockUpload = vi.fn();

vi.mock('../../lib/pixels-headless-client.js', () => ({
  createHeadlessProject: (...args: unknown[]) => mockCreateProject(...args),
  importMediaFromUrl: (...args: unknown[]) => mockImportMedia(...args),
  editHeadlessProject: (...args: unknown[]) => mockEditProject(...args),
  renderHeadlessProject: (...args: unknown[]) => mockRenderProject(...args),
  syncHeadlessWorkspace: vi.fn(),
}));

vi.mock('../../lib/gcs.js', () => ({
  uploadVideoToGcs: (...args: unknown[]) => mockUpload(...args),
  resolveReadableMediaUrl: async (url: string) => url,
}));

import {assembleAndSyncTimeline} from '../../tools/assemble-timeline.js';

describe('assembleAndSyncTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateProject.mockResolvedValue({
      id: 'hold_me_down_abc',
      revision: 'sha256:rev1',
      project: {id: 'hold_me_down_abc', name: 'Hold Me Down'},
    });

    mockImportMedia.mockImplementation(async ({id}: {id: string}) => ({
      id,
      revision: `sha256:${id}`,
      metadata: {duration: 8, mimeType: id.startsWith('clip') ? 'video/mp4' : 'audio/mpeg'},
    }));

    mockEditProject.mockResolvedValue({
      revision: 'sha256:rev2',
      persisted: true,
    });

    mockRenderProject.mockResolvedValue({
      buffer: Buffer.from('master-mp4'),
      contentType: 'video/mp4',
    });

    mockUpload.mockResolvedValue(
      'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/masters/hold_me_down_123.mp4',
    );
  });

  it('returns assembled master without mock: true', async () => {
    const result = await assembleAndSyncTimeline({
      project_title: 'Hold Me Down',
      clip_urls: [
        'https://storage.googleapis.com/bucket/cuts/scene_1.mp4',
        'https://storage.googleapis.com/bucket/cuts/scene_2.mp4',
      ],
      audio_uri: 'https://example.com/track.mp3',
      target_bpm: 120,
    });

    expect(result).toMatchObject({
      mock: false,
      status: 'assembled',
      project: 'Hold Me Down',
      total_cuts: 2,
      target_bpm: 120,
    });
    expect(result.master_timeline_url).toMatch(/^https:\/\/storage\.googleapis\.com\//);
    expect(mockCreateProject).toHaveBeenCalledOnce();
    expect(mockImportMedia).toHaveBeenCalledTimes(3);
    expect(mockEditProject).toHaveBeenCalledOnce();
    expect(mockRenderProject).toHaveBeenCalledOnce();
    expect(mockUpload).toHaveBeenCalledOnce();
  });
});
