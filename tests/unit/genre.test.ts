import {describe, expect, it} from 'vitest';
import {genreSkillRelPath, resolveGenre} from '../../lib/genre.js';

describe('resolveGenre', () => {
  it('selects dark-pop for synthwave / dark-pop briefs', () => {
    expect(resolveGenre('30-second dark synthwave intro at 120 BPM')).toBe(
      'dark-pop',
    );
    expect(resolveGenre('electronic dark-pop about drowning in love')).toBe(
      'dark-pop',
    );
  });

  it('selects hip-hop for rap / trap briefs', () => {
    expect(resolveGenre('boom-bap hip-hop video, night streets, 92 BPM')).toBe(
      'hip-hop',
    );
    expect(resolveGenre('trap video on a rooftop')).toBe('hip-hop');
  });

  it('prefers hip-hop when the brief also says electronic', () => {
    expect(resolveGenre('electronic hip-hop video at 92 BPM')).toBe('hip-hop');
    expect(resolveGenre('electronic trap on night streets')).toBe('hip-hop');
  });

  it('falls back to generic when the genre is unknown', () => {
    expect(resolveGenre('a folk waltz in a sunlit kitchen')).toBe('generic');
  });
});

describe('genreSkillRelPath', () => {
  it('maps packs onto skill files', () => {
    expect(genreSkillRelPath('dark-pop')).toBe('genres/dark-pop.md');
    expect(genreSkillRelPath('hip-hop')).toBe('genres/hip-hop.md');
    expect(genreSkillRelPath('generic')).toBe('craft/music-video.md');
  });
});
