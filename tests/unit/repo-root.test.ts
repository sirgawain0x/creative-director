import {mkdtempSync, rmSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import esbuild from 'esbuild';
import {pathToFileURL} from 'node:url';
import {
  findRepoRootFrom,
  genreDataDir,
  resolveRepoRoot,
} from '../../lib/repo-root.js';

describe('resolveRepoRoot', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('finds catalog by walking up from lib/', () => {
    const libDir = join(process.cwd(), 'lib');
    expect(findRepoRootFrom(libDir)).toBe(process.cwd());
  });

  it('prefers CREATIVE_DIRECTOR_REPO_ROOT when catalog exists there', () => {
    const fake = mkdtempSync(join(tmpdir(), 'cd-repo-'));
    mkdirSync(join(fake, 'data', 'genres'), {recursive: true});
    writeFileSync(join(fake, 'data', 'genres', 'catalog.json'), '[]');
    vi.stubEnv('CREATIVE_DIRECTOR_REPO_ROOT', fake);
    expect(resolveRepoRoot()).toBe(fake);
    rmSync(fake, {recursive: true, force: true});
  });

  it('uses process.cwd() when bundled import.meta.url is under tmp', () => {
    expect(genreDataDir()).toContain('data/genres');
    expect(genreDataDir()).toBe(
      join(process.cwd(), 'data', 'genres'),
    );
  });
});

describe('bundled genre loader (ADK esbuild simulation)', () => {
  it('loads catalog from repo cwd after bundle, not from /tmp/data', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'adk-sim-'));
    const outFile = join(outDir, 'genre-bundle.mjs');
    await esbuild.build({
      entryPoints: [join(process.cwd(), 'lib/genre.ts')],
      outfile: outFile,
      bundle: true,
      platform: 'node',
      format: 'esm',
    });
    const mod = await import(`${pathToFileURL(outFile).href}?v=${Date.now()}`);
    const count = mod.loadGenreCatalog().length;
    expect(count).toBeGreaterThan(20);
    rmSync(outDir, {recursive: true, force: true});
  });
});
