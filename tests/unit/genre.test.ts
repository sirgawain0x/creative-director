import {describe, expect, it} from 'vitest';
import {
  expandFamilyTemplate,
  genreSkillRelPath,
  loadGenreCatalog,
  loadStyleFamilies,
  normalizeGenreKey,
  resolveGenre,
  resolveGenrePack,
  resolveGenrePackFromData,
  type CatalogEntry,
  type StyleFamily,
} from '../../lib/genre.js';
import {loadSkill} from '../../lib/skills.js';

describe('normalizeGenreKey', () => {
  it('collapses r&b variants', () => {
    const keys = ['R&B', 'r-and-b', 'r and b', 'R And B', 'r_and_b'].map(
      normalizeGenreKey,
    );
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('r and b');
  });

  it('trims and lowercases', () => {
    expect(normalizeGenreKey('  Hip-Hop  ')).toBe('hip hop');
  });
});

describe('resolveGenrePack', () => {
  it('maps dark-pop aliases to deep pack', () => {
    const r = resolveGenrePack('30-second dark synthwave intro');
    expect(r.source).toBe('deep');
    expect(r.packId).toBe('dark-pop');
    expect(r.pack).toContain('## Visual Palette');
  });

  it('maps r&b spelling variants to the same deep pack', () => {
    const briefs = [
      'R&B music video',
      'r-and-b video',
      'r and b video',
      'r and b music video',
    ];
    const results = briefs.map((brief) => resolveGenrePack(brief));
    for (const r of results) {
      expect(r.catalogGenre).toBe('r-and-b');
      expect(r.source).toBe('deep');
      expect(r.packId).toBe('r-and-b');
      expect(r.warning).toBeUndefined();
    }
    expect(new Set(results.map((r) => r.packId)).size).toBe(1);
    expect(results[0]!.pack).toContain('## Visual Palette');
  });

  it('uses family template for non-deep catalog genres', () => {
    const r = resolveGenrePack('shoegaze dream video');
    expect(r.source).toBe('template');
    expect(r.pack).toContain('(Family:');
  });

  it('falls back to generic for nonsense', () => {
    const r = resolveGenrePack('asdfqwer zxcv music brief');
    expect(r.source).toBe('generic');
    expect(r.packId).toBe('generic');
  });

  it('resolves folk to its deep pack when the file exists', () => {
    const r = resolveGenrePack('a folk waltz in a sunlit kitchen');
    expect(r.catalogGenre).toBe('folk');
    expect(r.source).toBe('deep');
    expect(r.packId).toBe('folk');
    expect(r.warning).toBeUndefined();
    expect(r.pack).toContain('## Visual Palette');
  });

  it('tie-breaks equal matches alphabetically by id after deep preference', () => {
    const families: Record<string, StyleFamily> = {
      pop: {
        palette: 'p',
        motifs: 'm',
        camera: 'c',
        writer: 'w',
      },
    };
    const catalog: CatalogEntry[] = [
      {
        id: 'zeta-tie',
        label: 'Zeta Tie',
        appleAliases: ['tiephrase'],
        spotifyAliases: [],
        family: 'pop',
      },
      {
        id: 'alpha-tie',
        label: 'Alpha Tie',
        appleAliases: ['tiephrase'],
        spotifyAliases: [],
        family: 'pop',
      },
      {
        id: 'mu-deep',
        label: 'Mu Deep',
        appleAliases: ['tiephrase'],
        spotifyAliases: [],
        family: 'pop',
        deepPack: 'mu-deep',
      },
    ];
    const loadPack = (rel: string): string | null =>
      rel === 'genres/mu-deep.md' ? '# Mu\n\n## Visual Palette\nok' : null;

    const deepPref = resolveGenrePackFromData(
      'a tiephrase music video',
      catalog,
      families,
      loadPack,
    );
    expect(deepPref.catalogGenre).toBe('mu-deep');
    expect(deepPref.source).toBe('deep');
    expect(deepPref.packId).toBe('mu-deep');

    const alphaCatalog = catalog.filter((e) => e.id !== 'mu-deep');
    const alpha = resolveGenrePackFromData(
      'a tiephrase music video',
      alphaCatalog,
      families,
      () => null,
    );
    expect(alpha.catalogGenre).toBe('alpha-tie');
    expect(alpha.source).toBe('template');
  });

  it('warns via resolveGenrePackFromData when deep pack file is missing', () => {
    const families = loadStyleFamilies();
    const catalog: CatalogEntry[] = [
      {
        id: 'does-not-exist-pack',
        label: 'Missing Pack',
        appleAliases: ['missingpackxyz'],
        spotifyAliases: [],
        family: 'experimental',
        deepPack: 'does-not-exist-pack',
      },
    ];
    const r = resolveGenrePackFromData(
      'missingpackxyz brief',
      catalog,
      families,
      () => null,
    );
    expect(r.source).toBe('template');
    expect(r.catalogGenre).toBe('does-not-exist-pack');
    expect(r.packId).toBe('experimental');
    expect(r.warning).toMatch(
      /Deep pack file missing for does-not-exist-pack; using family experimental template/,
    );
    expect(r.pack).toContain('(Family: experimental)');
  });
});

describe('resolveGenre', () => {
  it('returns GenreId-safe deep packs only during transition', () => {
    expect(resolveGenre('30-second dark synthwave intro at 120 BPM')).toBe(
      'dark-pop',
    );
    expect(resolveGenre('boom-bap hip-hop video, night streets, 92 BPM')).toBe(
      'hip-hop',
    );
    expect(resolveGenre('asdfqwer zxcv music brief')).toBe('generic');
  });

  it('maps non-GenreId deep and template hits to generic for GenreId callers', () => {
    expect(resolveGenre('shoegaze dream video')).toBe('generic');
    // folk is deep in resolveGenrePack, but not a GenreId → generic
    expect(resolveGenre('a folk waltz in a sunlit kitchen')).toBe('generic');

    const shoegaze = resolveGenrePack('shoegaze dream video');
    expect(shoegaze.source).toBe('template');
    expect(shoegaze.pack).toContain('(Family:');

    const folk = resolveGenrePack('a folk waltz in a sunlit kitchen');
    expect(folk.catalogGenre).toBe('folk');
    expect(folk.source).toBe('deep');
    expect(folk.packId).toBe('folk');
  });
});

describe('genreSkillRelPath', () => {
  it('maps packs onto skill files', () => {
    expect(genreSkillRelPath('dark-pop')).toBe('genres/dark-pop.md');
    expect(genreSkillRelPath('hip-hop')).toBe('genres/hip-hop.md');
    expect(genreSkillRelPath('generic')).toBe('craft/music-video.md');
  });
});

describe('expandFamilyTemplate', () => {
  it('emits required section headers', () => {
    const families = loadStyleFamilies();
    const md = expandFamilyTemplate('Afrobeats', 'global', families.global);
    expect(md).toContain('# Afrobeats Visual Bible (Family: global)');
    expect(md).toContain('## Visual Palette');
    expect(md).toContain('## Core Motifs');
    expect(md).toContain('## Camera & Pacing');
    expect(md).toContain('## Narrative & Stylistic Directives');
    for (const h of [
      '## Visual Palette',
      '## Core Motifs',
      '## Camera & Pacing',
      '## Narrative & Stylistic Directives',
    ]) {
      const idx = md.indexOf(h);
      expect(idx).toBeGreaterThan(-1);
      const after = md.slice(idx + h.length).trimStart();
      expect(after.length).toBeGreaterThan(0);
      expect(after.startsWith('#')).toBe(false);
    }
  });

  it('expands every family with non-empty sections', () => {
    const families = loadStyleFamilies();
    for (const [familyId, family] of Object.entries(families)) {
      const md = expandFamilyTemplate('Test Label', familyId, family);
      expect(md).toContain(`# Test Label Visual Bible (Family: ${familyId})`);
      for (const h of [
        '## Visual Palette',
        '## Core Motifs',
        '## Camera & Pacing',
        '## Narrative & Stylistic Directives',
      ]) {
        const idx = md.indexOf(h);
        expect(idx).toBeGreaterThan(-1);
        const after = md.slice(idx + h.length).trimStart();
        expect(after.length).toBeGreaterThan(0);
        expect(after.startsWith('#')).toBe(false);
      }
    }
  });
});

describe('loadGenreCatalog', () => {
  it('includes all 25 deep packs and non-deep samples', () => {
    const catalog = loadGenreCatalog();
    const deep = catalog.filter((e) => e.deepPack);
    expect(deep.length).toBe(25);
    expect(catalog.some((e) => e.id === 'shoegaze' && !e.deepPack)).toBe(true);
  });

  it('every deepPack file exists with standard headers', () => {
    const catalog = loadGenreCatalog();
    const required = [
      '## Visual Palette',
      '## Core Motifs',
      '## Camera & Pacing',
      '## Narrative & Stylistic Directives',
    ];
    for (const entry of catalog) {
      if (!entry.deepPack) continue;
      const pack = loadSkill(`genres/${entry.deepPack}.md`);
      for (const h of required) expect(pack).toContain(h);
    }
  });
});
