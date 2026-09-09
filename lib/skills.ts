import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {genreSkillRelPath} from './genre.js';

/**
 * Resolve skills/ even when ADK loads the agent from a temp copy
 * (import.meta.url then points outside the repo).
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

export function skillsRootDir(): string {
  return skillsRoot;
}
