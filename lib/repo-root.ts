import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CATALOG_REL = join('data', 'genres', 'catalog.json');
const SKILLS_GENRES_REL = join('skills', 'genres');

function hasGenreCatalogAt(root: string): boolean {
  return existsSync(join(root, CATALOG_REL));
}

function hasSkillsGenresAt(root: string): boolean {
  return existsSync(join(root, SKILLS_GENRES_REL));
}

/** Walk up to `maxLevels` parents looking for `data/genres/catalog.json`. */
export function findRepoRootFrom(startDir: string, maxLevels = 12): string | null {
  let dir = startDir;
  for (let i = 0; i < maxLevels; i++) {
    if (hasGenreCatalogAt(dir)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * Resolve the agent repo root for runtime assets (`data/`, `skills/`).
 *
 * ADK bundles the agent with esbuild; bundled code then sees `import.meta.url`
 * under a temp directory, so path joins from `import.meta.url` miss `/app/data`.
 * Prefer `process.cwd()` and explicit env when the catalog exists there.
 */
export function resolveRepoRoot(): string {
  const explicit = process.env.CREATIVE_DIRECTOR_REPO_ROOT?.trim();
  if (explicit && hasGenreCatalogAt(explicit)) {
    return explicit;
  }

  const cwd = process.cwd();
  if (hasGenreCatalogAt(cwd)) {
    return cwd;
  }

  const fromModule = findRepoRootFrom(dirname(fileURLToPath(import.meta.url)));
  if (fromModule) {
    return fromModule;
  }

  if (explicit) {
    return explicit;
  }

  return cwd;
}

export function genreDataDir(): string {
  return join(resolveRepoRoot(), 'data', 'genres');
}

export function skillsRootDir(): string {
  return join(resolveRepoRoot(), 'skills');
}

export function isGenreCatalogPresent(): boolean {
  const root = resolveRepoRoot();
  return hasGenreCatalogAt(root) && hasSkillsGenresAt(root);
}
