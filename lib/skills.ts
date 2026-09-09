import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {genreSkillRelPath, type GenreId} from './genre.js';

const skillsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills');

/** Load a markdown skill pack relative to `skills/`. */
export function loadSkill(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    throw new Error(`Refusing skill path outside skills/: ${relPath}`);
  }
  return readFileSync(join(skillsRoot, normalized), 'utf8').trim();
}

export function loadGenrePack(genre: GenreId): string {
  return loadSkill(genreSkillRelPath(genre));
}

export function skillsRootDir(): string {
  return skillsRoot;
}
