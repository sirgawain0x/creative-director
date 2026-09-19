import {afterEach, describe, expect, it} from 'vitest';
import {
  createBatchRenderQuote,
  mapStoryboardSceneToShot,
  resetBatchQuoteStore,
  selectProvider,
} from '../../lib/batch-render-quote.js';

describe('batch-render-quote', () => {
  afterEach(() => {
    resetBatchQuoteStore();
  });

  it('selects Seedance when consistent_character is true', () => {
    expect(selectProvider({consistent_character: true})).toBe('seedance');
    expect(selectProvider({consistent_character: false})).toBe('veo');
    expect(selectProvider({preferred_provider: 'veo', consistent_character: true})).toBe(
      'veo',
    );
  });

  it('maps a storyboard scene to a priced shot quote', () => {
    const shot = mapStoryboardSceneToShot({
      scene_index: 1,
      timestamp_start: '00:00',
      timestamp_end: '00:08',
      camera_movement: 'slow dolly in',
      lighting: 'golden hour',
      visual_prompt: 'Rooftop singer silhouetted against skyline',
    });

    expect(shot.scene_index).toBe(1);
    expect(shot.provider).toBe('veo');
    expect(shot.duration_seconds).toBe(8);
    expect(shot.estimated_usdc6).toBeGreaterThan(0);
    expect(shot.crtvai_required).toMatch(/^\d+$/);
  });

  it('creates a batch quote with totals and pending_confirm status', () => {
    const quote = createBatchRenderQuote({
      shots: [
        {
          scene_index: 1,
          timestamp_start: '00:00',
          timestamp_end: '00:08',
          duration_seconds: 8,
          visual_prompt: 'Scene one',
          camera_movement: 'dolly in',
        },
        {
          scene_index: 2,
          timestamp_start: '00:08',
          timestamp_end: '00:16',
          duration_seconds: 8,
          visual_prompt: 'Scene two',
          camera_movement: 'orbit',
        },
      ],
      consistent_character: true,
    });

    expect(quote.status).toBe('pending_confirm');
    expect(quote.shot_count).toBe(2);
    expect(quote.shots.every((s) => s.provider === 'seedance')).toBe(true);
    expect(quote.total_estimated_usdc6).toBeGreaterThan(0);
    expect(quote.notice).toContain('QUOTE ONLY');
  });
});
