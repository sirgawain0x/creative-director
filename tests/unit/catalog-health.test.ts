import {describe, expect, it} from 'vitest';
import {checkGenreCatalogHealth} from '../../lib/catalog-health.js';

describe('checkGenreCatalogHealth', () => {
  it('passes in the real repo (vitest skips startup exit)', () => {
    const health = checkGenreCatalogHealth();
    expect(health).toEqual({ok: true});
  });
});
