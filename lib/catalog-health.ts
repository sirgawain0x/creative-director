import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {genreDataDir, resolveRepoRoot, skillsRootDir} from './repo-root.js';

export type CatalogHealthResult =
  | {ok: true}
  | {ok: false; errors: string[]};

function isCatalogCheckSkipped(): boolean {
  if (process.env.CREATIVE_DIRECTOR_SKIP_CATALOG_CHECK === '1') {
    return true;
  }
  if (process.env.VITEST === 'true') {
    return true;
  }
  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  return false;
}

/** Inspect catalog JSON, families JSON, and deep-pack markdown directory. */
export function checkGenreCatalogHealth(): CatalogHealthResult {
  const errors: string[] = [];
  const root = resolveRepoRoot();
  const dataDir = genreDataDir();
  const catalogPath = join(dataDir, 'catalog.json');
  const familiesPath = join(dataDir, 'families.json');
  const skillsGenresDir = join(skillsRootDir(), 'genres');

  if (!existsSync(catalogPath)) {
    errors.push(`missing catalog file: ${catalogPath} (repo root ${root})`);
  } else {
    try {
      const entries = JSON.parse(readFileSync(catalogPath, 'utf8')) as unknown;
      if (!Array.isArray(entries) || entries.length === 0) {
        errors.push(`catalog.json is empty or not an array: ${catalogPath}`);
      }
    } catch (e) {
      errors.push(
        `catalog.json unreadable: ${catalogPath} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }

  if (!existsSync(familiesPath)) {
    errors.push(`missing families file: ${familiesPath}`);
  }

  if (!existsSync(skillsGenresDir)) {
    errors.push(`missing skills genre pack directory: ${skillsGenresDir}`);
  } else {
    const mdFiles = readdirSync(skillsGenresDir).filter((f) => f.endsWith('.md'));
    if (mdFiles.length === 0) {
      errors.push(`skills genre pack directory has no .md files: ${skillsGenresDir}`);
    }
  }

  return errors.length === 0 ? {ok: true} : {ok: false, errors};
}

/**
 * Fail the process when the hybrid genre catalog is missing in production.
 *
 * We exit at startup (not only on readiness) because Cloud Run can mark the
 * revision healthy before any session calls `select_genre_pack`; a silent
 * fallback would ship broken genre routing without an obvious alert.
 */
export function assertGenreCatalogAtStartup(): void {
  if (isCatalogCheckSkipped()) {
    return;
  }
  const health = checkGenreCatalogHealth();
  if (health.ok) {
    return;
  }
  for (const err of health.errors) {
    console.error(`[creative-director] genre catalog startup check: ${err}`);
  }
  process.exit(1);
}
