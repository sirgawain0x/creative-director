import {describe, expect, it} from 'vitest';
import {loadGenrePack, loadSkill} from '../../lib/skills.js';

describe('loadSkill', () => {
  it('loads craft and genre packs', () => {
    expect(loadSkill('craft/beat-sync.md')).toMatch(/BPM/i);
    expect(loadSkill('craft/veo-prompting.md')).toMatch(/visual_prompt/);
    expect(loadSkill('genres/dark-pop.md')).toMatch(/neon/i);
    expect(loadSkill('genres/hip-hop.md')).toMatch(/handheld/i);
  });

  it('refuses path traversal', () => {
    expect(() => loadSkill('../package.json')).toThrow(/Refusing skill path/);
  });
});

describe('loadGenrePack', () => {
  it('returns generic craft rules for the fallback genre', () => {
    expect(loadGenrePack('generic')).toMatch(/treatment/i);
  });

  it('loads any deep pack id from skills/genres', () => {
    expect(loadGenrePack('afrobeats')).toMatch(/Visual Palette/);
  });
});
