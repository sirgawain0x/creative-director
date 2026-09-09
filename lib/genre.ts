import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export type GenrePackSource = 'deep' | 'template' | 'generic';

export type StyleFamily = {
  palette: string;
  motifs: string;
  camera: string;
  writer: string;
};

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'genres');

export function loadStyleFamilies(): Record<string, StyleFamily> {
  return JSON.parse(readFileSync(join(dataRoot, 'families.json'), 'utf8')) as Record<
    string,
    StyleFamily
  >;
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

export interface GenrePackResolution {
  catalogGenre: string;
  packId: string;
  source: GenrePackSource;
  pack: string;
  aliasesMatched?: string[];
  warning?: string;
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

export const GENRE_IDS = ['dark-pop', 'hip-hop', 'generic'] as const;

export type GenreId = (typeof GENRE_IDS)[number];

const DARK_POP =
  /\b(dark[-\s]?pop|synthwave|darkwave|electronic|melodic[-\s]?bass|dark[-\s]?synth)\b/i;
const HIP_HOP = /\b(hip[-\s]?hop|rap|trap|boom[-\s]?bap)\b/i;

/** Map a creator brief to a v1 genre pack. Unknown styles fall back to generic. */
export function resolveGenre(brief: string): GenreId {
  // Hip-hop tokens are more specific than the dark-pop token "electronic"
  // (e.g. "electronic hip-hop" / "electronic trap").
  if (HIP_HOP.test(brief)) {
    return 'hip-hop';
  }
  if (DARK_POP.test(brief)) {
    return 'dark-pop';
  }
  return 'generic';
}

export function genreSkillRelPath(genre: GenreId): string {
  if (genre === 'generic') {
    return 'craft/music-video.md';
  }
  return `genres/${genre}.md`;
}
