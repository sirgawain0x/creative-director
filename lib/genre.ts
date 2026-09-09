import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export type GenrePackSource = 'deep' | 'template' | 'generic';

export type StyleFamily = {
  palette: string;
  motifs: string;
  camera: string;
  writer: string;
};

export type CatalogEntry = {
  id: string;
  label: string;
  appleAliases: string[];
  spotifyAliases: string[];
  family: string;
  deepPack?: string;
};

export interface GenrePackResolution {
  catalogGenre: string;
  packId: string;
  source: GenrePackSource;
  pack: string;
  aliasesMatched?: string[];
  warning?: string;
}

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'genres');

/**
 * Resolve skills/ without importing lib/skills.ts (avoids circular imports
 * when skills.ts imports genre helpers).
 */
function resolveSkillsRoot(): string {
  const fromModule = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'skills',
  );
  if (existsSync(fromModule)) {
    return fromModule;
  }
  const fromCwd = join(process.cwd(), 'skills');
  if (existsSync(fromCwd)) {
    return fromCwd;
  }
  return fromModule;
}

const skillsRoot = resolveSkillsRoot();

function tryLoadSkillRel(relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    return null;
  }
  const full = join(skillsRoot, normalized);
  if (!existsSync(full)) {
    return null;
  }
  return readFileSync(full, 'utf8').trim();
}

export function loadStyleFamilies(): Record<string, StyleFamily> {
  return JSON.parse(readFileSync(join(dataRoot, 'families.json'), 'utf8')) as Record<
    string,
    StyleFamily
  >;
}

export function loadGenreCatalog(): CatalogEntry[] {
  return JSON.parse(readFileSync(join(dataRoot, 'catalog.json'), 'utf8')) as CatalogEntry[];
}

export function expandFamilyTemplate(
  label: string,
  familyId: string,
  family: StyleFamily,
): string {
  return [
    `# ${label} Visual Bible (Family: ${familyId})`,
    '',
    '## Visual Palette',
    family.palette,
    '',
    '## Core Motifs',
    family.motifs,
    '',
    '## Camera & Pacing',
    family.camera,
    '',
    '## Narrative & Stylistic Directives',
    family.writer,
  ].join('\n');
}

export function normalizeGenreKey(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[_\s]+/g, ' ')
    .replace(/[-\s]+/g, ' ')
    .trim();
}

type AliasHit = {entry: CatalogEntry; alias: string; length: number};

const GENERIC_CRAFT_REL = 'craft/music-video.md';
const GENERIC_CRAFT_STUB =
  '# Music Video\n\n## Visual Palette\nGeneric.';

/** True when normalized alias equals the brief or appears as whole token(s). */
export function aliasMatchesNormBrief(
  normBrief: string,
  normAlias: string,
): boolean {
  if (!normAlias) return false;
  if (normBrief === normAlias) return true;
  const escaped = normAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(normBrief);
}

function collectHits(normBrief: string, catalog: CatalogEntry[]): AliasHit[] {
  const hits: AliasHit[] = [];
  for (const entry of catalog) {
    for (const alias of [
      ...entry.appleAliases,
      ...entry.spotifyAliases,
      entry.id,
      entry.label,
    ]) {
      const na = normalizeGenreKey(alias);
      if (!na) continue;
      if (aliasMatchesNormBrief(normBrief, na)) {
        hits.push({entry, alias, length: na.length});
      }
    }
  }
  return hits;
}

function sortHits(hits: AliasHit[]): void {
  hits.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const aDeep = a.entry.deepPack ? 0 : 1;
    const bDeep = b.entry.deepPack ? 0 : 1;
    if (aDeep !== bDeep) return aDeep - bDeep;
    return a.entry.id.localeCompare(b.entry.id);
  });
}

function tryTemplateForEntry(
  entry: CatalogEntry,
  families: Record<string, StyleFamily>,
): string | null {
  const family = families[entry.family];
  if (!family) return null;
  return expandFamilyTemplate(entry.label, entry.family, family);
}

function genericResolution(
  loadPack: (relPath: string) => string | null,
  warning?: string,
): GenrePackResolution {
  const craft = loadPack(GENERIC_CRAFT_REL);
  const warnings = [
    warning,
    craft
      ? undefined
      : `Generic craft pack missing: ${GENERIC_CRAFT_REL}; using stub.`,
  ].filter((w): w is string => Boolean(w));
  return {
    catalogGenre: 'generic',
    packId: 'generic',
    source: 'generic',
    pack: craft ?? GENERIC_CRAFT_STUB,
    ...(warnings.length > 0 ? {warning: warnings.join(' ')} : {}),
  };
}

/**
 * Testable resolver: inject catalog, families, and pack loader.
 * `loadPack` returns markdown or null when the deep pack file is missing.
 */
export function resolveGenrePackFromData(
  brief: string,
  catalog: CatalogEntry[],
  families: Record<string, StyleFamily>,
  loadPack: (relPath: string) => string | null,
): GenrePackResolution {
  const normBrief = normalizeGenreKey(brief);
  const hits = collectHits(normBrief, catalog);

  if (hits.length === 0) {
    return genericResolution(loadPack);
  }

  sortHits(hits);
  const best = hits[0]!;
  const aliasesMatched = [
    ...new Set(
      hits.filter((h) => h.entry.id === best.entry.id).map((h) => h.alias),
    ),
  ];

  if (best.entry.deepPack) {
    const rel = `genres/${best.entry.deepPack}.md`;
    const pack = loadPack(rel);
    if (pack) {
      return {
        catalogGenre: best.entry.id,
        packId: best.entry.deepPack,
        source: 'deep',
        pack,
        aliasesMatched,
      };
    }
    const template = tryTemplateForEntry(best.entry, families);
    if (template) {
      return {
        catalogGenre: best.entry.id,
        packId: best.entry.family,
        source: 'template',
        pack: template,
        aliasesMatched,
        warning: `Deep pack file missing for ${best.entry.deepPack}; using family ${best.entry.family} template.`,
      };
    }
    return {
      ...genericResolution(
        loadPack,
        `Deep pack file missing for ${best.entry.deepPack} and unknown style family: ${best.entry.family}; using generic craft pack.`,
      ),
      aliasesMatched,
    };
  }

  const template = tryTemplateForEntry(best.entry, families);
  if (template) {
    return {
      catalogGenre: best.entry.id,
      packId: best.entry.family,
      source: 'template',
      pack: template,
      aliasesMatched,
    };
  }

  return {
    ...genericResolution(
      loadPack,
      `Unknown style family: ${best.entry.family}; using generic craft pack.`,
    ),
    aliasesMatched,
  };
}

export function resolveGenrePack(brief: string): GenrePackResolution {
  return resolveGenrePackFromData(
    brief,
    loadGenreCatalog(),
    loadStyleFamilies(),
    tryLoadSkillRel,
  );
}

/** Skill-relative path for a pack id (`generic` → craft fallback). */
export function genreSkillRelPath(packId: string): string {
  if (packId === 'generic') {
    return 'craft/music-video.md';
  }
  return `genres/${packId}.md`;
}
