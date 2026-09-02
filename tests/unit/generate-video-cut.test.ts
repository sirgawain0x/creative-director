import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockGenerateGeminiImage = vi.fn();
const mockStartVeoVideo = vi.fn();
const mockWaitForVeoVideo = vi.fn();
const mockUploadVideoToGcs = vi.fn();

vi.mock('../../lib/vertex-generative.js', () => ({
  generateGeminiImage: (...args: unknown[]) => mockGenerateGeminiImage(...args),
  startVeoVideo: (...args: unknown[]) => mockStartVeoVideo(...args),
  waitForVeoVideo: (...args: unknown[]) => mockWaitForVeoVideo(...args),
}));

vi.mock('../../lib/gcs.js', () => ({
  uploadVideoToGcs: (...args: unknown[]) => mockUploadVideoToGcs(...args),
}));

import {generateVideoCut} from '../../tools/generate-video-cut.js';

describe('generateVideoCut', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateGeminiImage.mockResolvedValue({
      mimeType: 'image/png',
      base64: Buffer.from('still-image').toString('base64'),
    });

    mockStartVeoVideo.mockResolvedValue({
      operationName: 'projects/test/locations/us-central1/operations/op-123',
      modelId: 'veo-3.1-generate-preview',
    });

    mockWaitForVeoVideo.mockResolvedValue({
      status: 'completed',
      progress: 100,
      videoBase64: Buffer.from('fake-mp4-bytes').toString('base64'),
      mimeType: 'video/mp4',
    });

    mockUploadVideoToGcs.mockResolvedValue(
      'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/cuts/scene_1_1234567890.mp4',
    );
  });

  it('returns a real render result without mock: true', async () => {
    const result = await generateVideoCut({
      scene_index: 1,
      timestamp_start: '00:00',
      timestamp_end: '00:08',
      duration_seconds: 8,
      visual_prompt: 'Golden hour rooftop, singer silhouetted against skyline',
      camera_movement: 'slow dolly in',
    });

    expect(result).toMatchObject({
      mock: false,
      status: 'rendered',
      scene_index: 1,
      timecode: '00:00 - 00:08',
      clip_url:
        'https://storage.googleapis.com/creative-ai-491118-creative-pixels-renders/cuts/scene_1_1234567890.mp4',
    });
    expect(result.mock).toBe(false);
    expect(result.clip_url).toMatch(/^https:\/\/storage\.googleapis\.com\//);

    expect(mockGenerateGeminiImage).toHaveBeenCalledOnce();
    expect(mockStartVeoVideo).toHaveBeenCalledOnce();
    expect(mockWaitForVeoVideo).toHaveBeenCalledOnce();
    expect(mockUploadVideoToGcs).toHaveBeenCalledOnce();

    const uploadArgs = mockUploadVideoToGcs.mock.calls[0];
    expect(uploadArgs[0]).toBeInstanceOf(Buffer);
    expect(String(uploadArgs[1])).toMatch(/^cuts\/scene_1_\d+\.mp4$/);

    const startArgs = mockStartVeoVideo.mock.calls[0][0];
    expect(startArgs.endImage).toEqual(startArgs.startImage);
    expect(startArgs.duration).toBe(8);
  });

  it('throws when Veo reports failure', async () => {
    mockWaitForVeoVideo.mockResolvedValue({
      status: 'failed',
      progress: 100,
      errorMessage: 'Veo quota exceeded',
    });

    await expect(
      generateVideoCut({
        scene_index: 2,
        timestamp_start: '00:08',
        timestamp_end: '00:16',
        duration_seconds: 8,
        visual_prompt: 'Neon alley chase',
        camera_movement: 'handheld tracking',
      }),
    ).rejects.toThrow('Veo quota exceeded');
  });
});
