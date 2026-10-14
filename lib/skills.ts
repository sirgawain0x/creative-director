import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {genreSkillRelPath} from './genre.js';
import {skillsRootDir} from './repo-root.js';

const skillsRoot = skillsRootDir();

/** Load a markdown skill pack relative to `skills/`. */
export function loadSkill(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    throw new Error(`Refusing skill path outside skills/: ${relPath}`);
  }
  return readFileSync(join(skillsRoot, normalized), 'utf8').trim();
}

/** Load a genre deep pack or the generic craft fallback by pack id. */
export function loadGenrePack(packId: string): string {
  return loadSkill(genreSkillRelPath(packId));
}

export {skillsRootDir};
