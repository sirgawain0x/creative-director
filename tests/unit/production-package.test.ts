import {describe, expect, it} from 'vitest';
import {productionPackageSchema} from '../../lib/production-package.js';

describe('productionPackageSchema', () => {
  it('accepts a writer→DP package without invented URLs', () => {
    const parsed = productionPackageSchema.parse({
      genre: 'dark-pop',
      treatment: 'A figure sinks through neon water.',
      storyboard: [
        {
          scene_index: 1,
          timestamp_start: '00:00',
          timestamp_end: '00:08',
          camera_movement: 'slow crane descent',
          lighting: 'crimson ember under-light',
          visual_prompt:
            'A figure suspended in a dark liquid void, crimson glow in the chest, overhead crane shot.',
        },
      ],
    });
    expect(parsed.clip_urls).toBeUndefined();
    expect(parsed.master_url).toBeUndefined();
  });

  it('rejects an empty storyboard', () => {
    const result = productionPackageSchema.safeParse({
      genre: 'hip-hop',
      treatment: 'Rooftop cypher.',
      storyboard: [],
    });
    expect(result.success).toBe(false);
  });
});
