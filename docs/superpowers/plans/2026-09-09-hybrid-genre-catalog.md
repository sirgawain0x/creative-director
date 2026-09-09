# Hybrid Genre Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognize Apple Music + Spotify genre aliases, serve ~25 deep visual packs, and expand everything else from style-family templates via `select_genre_pack`.

**Architecture:** Static `data/genres/catalog.json` + `families.json`; `normalizeGenreKey` + `resolveGenrePack` in `lib/genre.ts`; template expander builds deterministic markdown; director passes `pack` text in Writer/DP `AgentTool` messages (not session state).

**Tech Stack:** TypeScript, Vitest, Google ADK (`FunctionTool`, `AgentTool`), existing `skills/` markdown loaders.

## Global Constraints

- Follow `docs/superpowers/specs/2026-09-09-hybrid-genre-catalog-design.md` exactly (including `warning?`, pack headers, normalization, alphabetical tie-break, AgentTool pack handoff).
- Do not change Veo / Pixels / C2PA tools or A2A `specialistAgentTool` wiring.
- Do not call live Spotify/Apple APIs.
- Keep `App.name` as `'agent'` if touching `agent.ts` (Dev UI session lookup).
- Run tests with `npm run test:unit` (Vitest). Prefer TDD: failing test → implement → pass → commit.
- Never commit `.env` or secrets.

## File map

| Path | Responsibility |
|------|----------------|
| `data/genres/families.json` | Style family template fields |
| `data/genres/catalog.json` | Normalized genre entries + aliases |
| `lib/genre.ts` | Types, normalize, resolve, template expand, skill path helpers |
| `lib/skills.ts` | Load deep/generic pack files; used by resolver |
| `lib/production-package.ts` | `genre: z.string().min(1)` |
| `agent.ts` | `select_genre_pack` returns `GenrePackResolution` |
| `agents/director-instructions.ts` | Pack handoff + package shape |
| `agents/writer.ts` / `agents/dp.ts` | Drop inlined deep packs; follow pasted pack |
| `skills/genres/*.md` | ~25 deep packs with standard headers |
| `tests/unit/genre.test.ts` | Normalization, resolver, templates, warnings |
| `tests/unit/production-package.test.ts` | Schema accepts string genre ids (create if missing) |
| `README.md` | Short “add a genre” maintenance note |

---

### Task 1: Normalization + types

**Files:**
- Modify: `lib/genre.ts`
- Modify: `tests/unit/genre.test.ts`

**Interfaces:**
- Produces: `GenrePackSource`, `GenrePackResolution`, `normalizeGenreKey(input: string): string`

- [ ] **Step 1: Write failing normalization tests**

Replace/extend `tests/unit/genre.test.ts` with:

```ts
import {describe, expect, it} from 'vitest';
import {normalizeGenreKey} from '../../lib/genre.js';

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
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm run test:unit -- tests/unit/genre.test.ts`
Expected: FAIL — `normalizeGenreKey` not exported / not found.

- [ ] **Step 3: Implement types + `normalizeGenreKey`**

In `lib/genre.ts`, add (keep temporary old `GENRE_IDS` until Task 3 removes regex resolver, or replace carefully):

```ts
export type GenrePackSource = 'deep' | 'template' | 'generic';

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
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm run test:unit -- tests/unit/genre.test.ts`
Expected: PASS for `normalizeGenreKey` cases.

- [ ] **Step 5: Commit**

```bash
git add lib/genre.ts tests/unit/genre.test.ts
git commit -m "$(cat <<'EOF'
Add genre key normalization and GenrePackResolution types.

EOF
)"
```

---

### Task 2: Family templates + expander

**Files:**
- Create: `data/genres/families.json`
- Modify: `lib/genre.ts`
- Modify: `tests/unit/genre.test.ts`

**Interfaces:**
- Consumes: `normalizeGenreKey` (Task 1)
- Produces: `StyleFamily`, `loadStyleFamilies()`, `expandFamilyTemplate(label, familyId, family): string`

- [ ] **Step 1: Write failing expander tests**

```ts
import {expandFamilyTemplate, loadStyleFamilies} from '../../lib/genre.js';

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
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm run test:unit -- tests/unit/genre.test.ts`
Expected: FAIL — missing module exports / file.

- [ ] **Step 3: Add `data/genres/families.json`**

Create all ten families with non-empty `palette`, `motifs`, `camera`, `writer` strings (2–4 sentences each). Example shape:

```json
{
  "urban": {
    "palette": "Night exteriors, sodium streetlight, brick, amber vs ice-blue contrast.",
    "motifs": "Strut, cypher, rooftop, low-angle hero presence.",
    "camera": "Handheld tracking, crash zooms on accents, motivated practicals.",
    "writer": "Boast, confession, or come-up in images; no fake brand merch."
  },
  "electronic": {
    "palette": "Deep navy/black, neon practicals, volumetric shafts, single warm accent.",
    "motifs": "Suspension, freefall on drops, hollow interior space, frozen time.",
    "camera": "Crane descents, orbits, whip-zooms on hits.",
    "writer": "Singular protagonist, emotional gravity over plot dump."
  },
  "pop": {
    "palette": "Clean high-key or glossy night; one signature wardrobe color.",
    "motifs": "Hooks as visual refrains; mirror/phone/stage motifs sparingly.",
    "camera": "Steadicam verses, wider chorus geography, crisp cuts on downbeats.",
    "writer": "Clear emotional want; keep generative-video-friendly faces/bodies."
  },
  "rock": {
    "palette": "Stage tungsten, smoke, daylight grit, denim/leather textures.",
    "motifs": "Live energy, road, rehearsal rooms, crowd surge on chorus.",
    "camera": "Handheld pit energy, slow push on bridges.",
    "writer": "Conflict and release; avoid copyrighted lyric quotes."
  },
  "acoustic": {
    "palette": "Warm daylight, wood, linen, soft window light.",
    "motifs": "Hands, instruments, intimate rooms, landscape breathers.",
    "camera": "Locked-off intimacy, gentle dollies, natural light priority.",
    "writer": "Quiet stakes, memory, place-as-character."
  },
  "global": {
    "palette": "Saturated local color, golden hour, market/street practicals.",
    "motifs": "Community, dance circles, procession, city-to-landscape contrast.",
    "camera": "Wide establishing + close rhythm cuts on percussion.",
    "writer": "Culture-specific motifs without costume cliché; respect locality."
  },
  "metal": {
    "palette": "High contrast B/W or desaturated cold steel; strobe accents.",
    "motifs": "Crush, ritual, void, industrial spaces.",
    "camera": "Aggressive push-ins, whip pans on blasts.",
    "writer": "Power and catharsis; keep practical, not cartoon CGI."
  },
  "dance": {
    "palette": "Club RGB, lasers, wet floors, dawn-after exteriors.",
    "motifs": "Bodies in sync, DJ booth glimpses, euphoria vs comedown.",
    "camera": "Sweeping cranes, rhythmic jump cuts on kicks.",
    "writer": "Physical joy and release; faceless-enough for generative video."
  },
  "jazz-soul": {
    "palette": "Warm tungsten, brass highlights, velvet shadow.",
    "motifs": "Club booths, late-night streets, intimate duets.",
    "camera": "Slow orbits, smoke shafts, soft rack focus.",
    "writer": "Mood-first narrative; restraint over spectacle."
  },
  "experimental": {
    "palette": "Unnatural grades, film damage, sparse practicals.",
    "motifs": "Abstract body, glitch, surreal object logic.",
    "camera": "Jump cuts, locked surreal frames, unexpected angles.",
    "writer": "Image-led meaning; avoid explaining the metaphor."
  }
}
```

- [ ] **Step 4: Implement loader + expander in `lib/genre.ts`**

```ts
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

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
```

Also add a unit test that **every** family in JSON expands with non-empty sections (loop `Object.entries(loadStyleFamilies())`).

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm run test:unit -- tests/unit/genre.test.ts`

- [ ] **Step 6: Commit**

```bash
git add data/genres/families.json lib/genre.ts tests/unit/genre.test.ts
git commit -m "$(cat <<'EOF'
Add style-family templates and deterministic pack markdown expander.

EOF
)"
```

---

### Task 3: Catalog + `resolveGenrePack`

**Files:**
- Create: `data/genres/catalog.json` (initial seed: all 25 deep ids + ≥1 non-deep per family)
- Modify: `lib/genre.ts`
- Modify: `lib/skills.ts` (optional helper used by resolver)
- Modify: `tests/unit/genre.test.ts`

**Interfaces:**
- Consumes: `normalizeGenreKey`, `expandFamilyTemplate`, `loadStyleFamilies`, `loadSkill`
- Produces: `CatalogEntry`, `loadGenreCatalog()`, `resolveGenrePack(brief: string): GenrePackResolution`
- Deprecates: old `resolveGenre(): GenreId` regex path — replace call sites in Task 5; keep a thin `resolveGenre(brief) => resolveGenrePack(brief).packId` only if needed for transition, or update tests to use `resolveGenrePack`.

- [ ] **Step 1: Write failing resolver tests**

```ts
describe('resolveGenrePack', () => {
  it('maps dark-pop aliases to deep pack', () => {
    const r = resolveGenrePack('30-second dark synthwave intro');
    expect(r.source).toBe('deep');
    expect(r.packId).toBe('dark-pop');
    expect(r.pack).toContain('## Visual Palette');
  });

  it('maps r&b spelling variants to the same deep pack', () => {
    for (const brief of ['R&B music video', 'r-and-b video', 'r and b video']) {
      expect(resolveGenrePack(brief).packId).toBe('r-and-b');
    }
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

  it('tie-breaks equal matches alphabetically by id after deep preference', () => {
    // Requires two catalog entries with same-length alias collision in fixture;
    // assert chosen id is the alphabetically first among ties.
  });
});
```

Include a `shoegaze` (or similar) catalog entry with `family: "rock"` or `experimental` and **no** `deepPack`.

Update the old folk expectation: `resolveGenrePack('a folk waltz…').packId` should be `'folk'` (deep), not generic.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Seed `data/genres/catalog.json`**

Array of objects. Minimum:

- One entry per deep pack id (25), each with `deepPack` equal to `id`, `family` appropriate, and Apple/Spotify aliases (include hyphen/space/`&` variants for `r-and-b`, `k-pop`, `hip-hop`, `dark-pop`).
- Non-deep samples, e.g. `shoegaze` → `experimental` or `rock`, `bossa-nova` → `jazz-soul`, `hardstyle` → `dance`, `bluegrass` → `acoustic`, `afro-house` → `global` (if not colliding with amapiano deep), etc.

Example entry:

```json
{
  "id": "r-and-b",
  "label": "R&B",
  "appleAliases": ["R&B", "R&B/Soul"],
  "spotifyAliases": ["r&b", "r-n-b"],
  "family": "jazz-soul",
  "deepPack": "r-and-b"
}
```

- [ ] **Step 4: Implement resolver**

Logic sketch:

```ts
export type CatalogEntry = {
  id: string;
  label: string;
  appleAliases: string[];
  spotifyAliases: string[];
  family: string;
  deepPack?: string;
};

export function resolveGenrePack(brief: string): GenrePackResolution {
  const families = loadStyleFamilies();
  const catalog = loadGenreCatalog();
  const normBrief = normalizeGenreKey(brief);

  type Hit = {entry: CatalogEntry; alias: string; length: number};
  const hits: Hit[] = [];
  for (const entry of catalog) {
    for (const alias of [...entry.appleAliases, ...entry.spotifyAliases, entry.id, entry.label]) {
      const na = normalizeGenreKey(alias);
      if (!na) continue;
      if (normBrief === na || normBrief.includes(na)) {
        hits.push({entry, alias, length: na.length});
      }
    }
  }

  if (hits.length === 0) {
    const pack = loadSkill('craft/music-video.md');
    return {
      catalogGenre: 'generic',
      packId: 'generic',
      source: 'generic',
      pack,
    };
  }

  hits.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const aDeep = a.entry.deepPack ? 0 : 1;
    const bDeep = b.entry.deepPack ? 0 : 1;
    if (aDeep !== bDeep) return aDeep - bDeep;
    return a.entry.id.localeCompare(b.entry.id);
  });

  const best = hits[0]!;
  const aliasesMatched = [...new Set(hits.filter(h => h.entry.id === best.entry.id).map(h => h.alias))];

  if (best.entry.deepPack) {
    const rel = `genres/${best.entry.deepPack}.md`;
    try {
      const pack = loadSkill(rel);
      return {
        catalogGenre: best.entry.id,
        packId: best.entry.deepPack,
        source: 'deep',
        pack,
        aliasesMatched,
      };
    } catch {
      const family = families[best.entry.family];
      const pack = expandFamilyTemplate(best.entry.label, best.entry.family, family);
      return {
        catalogGenre: best.entry.id,
        packId: best.entry.family,
        source: 'template',
        pack,
        aliasesMatched,
        warning: `Deep pack file missing for ${best.entry.deepPack}; using family ${best.entry.family} template.`,
      };
    }
  }

  const family = families[best.entry.family];
  return {
    catalogGenre: best.entry.id,
    packId: best.entry.family,
    source: 'template',
    pack: expandFamilyTemplate(best.entry.label, best.entry.family, family),
    aliasesMatched,
  };
}
```

Wire `loadSkill` from `./skills.js` (watch circular imports: if `skills.ts` imports `genre.ts`, move path helper only or lazy-load). Prefer: `skills.ts` stops importing `GenreId` for `loadGenrePack` until Task 5; or pass `readFileSync` via a local skills read that duplicates the safe path join.

**Circular import fix:** keep file loading inside `lib/genre.ts` using the same `skillsRoot` resolution pattern as `lib/skills.ts`, or export `tryLoadSkill(rel): string | null` from skills without importing genre.

- [ ] **Step 5: Test missing deep pack warning**

Temporarily point a test-only entry or mock: easiest approach — `resolveGenrePack` path that calls internal `loadDeepPackOrWarn`. Unit-test with a catalog entry `deepPack: 'does-not-exist-pack'` added only in test via injecting catalog, **or** spy/mock. Prefer exporting `resolveGenrePackFromData(brief, catalog, families, loadPack)` for testability.

- [ ] **Step 6: Run tests — PASS**

- [ ] **Step 7: Commit**

```bash
git add data/genres/catalog.json lib/genre.ts lib/skills.ts tests/unit/genre.test.ts
git commit -m "$(cat <<'EOF'
Resolve briefs through the hybrid genre catalog with template fallback.

EOF
)"
```

---

### Task 4: Deep pack markdown files (~25)

**Files:**
- Modify: `skills/genres/dark-pop.md`, `skills/genres/hip-hop.md` (migrate headers)
- Create: `skills/genres/{pop,r-and-b,soul,afrobeats,amapiano,latin,reggaeton,k-pop,country,rock,indie,metal,punk,edm,house,techno,drill,grime,jazz,blues,folk,gospel,classical-cinematic}.md`

**Interfaces:**
- Consumes: pack header format from spec
- Produces: files loadable by `loadSkill('genres/<id>.md')`

- [ ] **Step 1: Write a smoke test that every catalog `deepPack` file exists and has required headers**

```ts
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
```

- [ ] **Step 2: Run — expect FAIL** (missing files / old headers)

- [ ] **Step 3: Migrate + create packs**

Each file:

```markdown
# <Label>

## Visual Palette
...

## Core Motifs
...

## Camera & Pacing
...

## Narrative & Stylistic Directives
...
```

Rewrite dark-pop / hip-hop content into these headers (preserve creative intent). For new genres, write concise MV-specific guidance (palette/motifs/camera/writer) — quality over length; 4–8 bullets total per pack is enough.

- [ ] **Step 4: Run smoke test — PASS**

- [ ] **Step 5: Commit**

```bash
git add skills/genres
git commit -m "$(cat <<'EOF'
Add ~25 deep genre visual bibles with shared section headers.

EOF
)"
```

---

### Task 5: Wire tool + production package schema

**Files:**
- Modify: `agent.ts` (`select_genre_pack`)
- Modify: `lib/production-package.ts`
- Create or modify: `tests/unit/production-package.test.ts`
- Modify: `tests/unit/genre.test.ts` (remove obsolete `GENRE_IDS` / `genreSkillRelPath` expectations or update)

**Interfaces:**
- Consumes: `resolveGenrePack`
- Produces: tool output = `GenrePackResolution`; schema `genre: z.string().min(1)`

- [ ] **Step 1: Failing schema test**

```ts
import {productionPackageSchema} from '../../lib/production-package.js';

it('accepts catalog genre ids beyond the old enum', () => {
  const parsed = productionPackageSchema.parse({
    genre: 'afrobeats',
    treatment: 'x',
    storyboard: [
      {
        scene_index: 1,
        timestamp_start: '0:00',
        timestamp_end: '0:08',
        camera_movement: 'push',
        lighting: 'neon',
        visual_prompt: 'wide night street',
      },
    ],
  });
  expect(parsed.genre).toBe('afrobeats');
});
```

- [ ] **Step 2: Run — FAIL** if still `z.enum(GENRE_IDS)`

- [ ] **Step 3: Change schema**

```ts
export const productionPackageSchema = z.object({
  genre: z.string().min(1),
  treatment: z.string().min(1),
  storyboard: z.array(storyboardSceneSchema).min(1),
  clip_urls: z.array(z.string()).optional(),
  master_url: z.string().optional(),
});
```

Remove `GENRE_IDS` import if unused.

- [ ] **Step 4: Update `select_genre_pack` in `agent.ts`**

```ts
execute: async ({brief}) => resolveGenrePack(brief),
```

Update tool description to mention hybrid catalog / deep vs template / warning.

- [ ] **Step 5: Fix any broken imports of `resolveGenre` / `GENRE_IDS` / `loadGenrePack(genre: GenreId)`** across repo (`rg` for them).

- [ ] **Step 6: Run `npm run test:unit` — PASS**

- [ ] **Step 7: Commit**

```bash
git add agent.ts lib/production-package.ts lib/genre.ts lib/skills.ts tests/unit
git commit -m "$(cat <<'EOF'
Wire select_genre_pack to hybrid resolver and loosen package genre ids.

EOF
)"
```

---

### Task 6: Director / Writer / DP prompt updates

**Files:**
- Modify: `agents/director-instructions.ts`
- Modify: `agents/writer.ts`
- Modify: `agents/dp.ts`

**Interfaces:**
- Consumes: tool result fields `catalogGenre`, `packId`, `source`, `pack`, `warning?`
- Produces: specialists follow pasted pack text only

- [ ] **Step 1: Update `SWARM_PACKAGE_SHAPE`**

```ts
export const SWARM_PACKAGE_SHAPE = `Deliverable package fields (text is fine; keep names exact):
- genre: catalogGenre from select_genre_pack (also note packId + source; include warning if present)
- treatment: from writer_agent
- storyboard: scenes with scene_index, timestamp_start, timestamp_end, camera_movement, lighting, visual_prompt
- clip_urls / master_url: only after real or mock tool results — never invent them`;
```

- [ ] **Step 2: Update planning/production workflows**

Explicit lines:

```
1. Call select_genre_pack with the user brief.
2. When calling writer_agent, paste the returned pack markdown verbatim in the tool message, plus catalogGenre, packId, and source.
3. When calling dp_agent, paste the same pack markdown, treatment, BPM, and genre ids.
```

Remove “dark-pop, hip-hop, or generic fallback” wording.

- [ ] **Step 3: Slim Writer/DP instructions**

Remove `loadSkill('genres/dark-pop.md')` / hip-hop inlining. Keep craft skills on DP (`beat-sync`, `veo-prompting`) and optionally generic music-video as fallback if no pack text was provided.

Writer instruction core:

```
The director pastes a genre visual bible in the message. Apply that pack text. If none is pasted, use the generic craft guidance below.
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/director-instructions.ts agents/writer.ts agents/dp.ts
git commit -m "$(cat <<'EOF'
Pass genre packs to Writer/DP via AgentTool message text.

EOF
)"
```

---

### Task 7: Docs + final verification

**Files:**
- Modify: `README.md` (short maintenance section)
- Optionally: `docs/superpowers/specs/2026-09-09-hybrid-genre-catalog-design.md` only if implementation taught a fix (keep in sync)

- [ ] **Step 1: Add README subsection**

Document:

1. Add aliases to `data/genres/catalog.json`
2. Map `family` for template-only genres
3. To promote to deep: add `skills/genres/<id>.md` with four headers + set `deepPack`

- [ ] **Step 2: Full unit tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 3: Manual smoke (optional if `adk:web` available)**

Brief: `afrobeats video at 110 BPM` → tool shows `source: "deep"`.  
Brief: `shoegaze` → `source: "template"`.  
Brief: `hello` nonsense genre → `generic`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Document how to extend the hybrid genre catalog.

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `warning?` on resolution | 3 |
| Deterministic template headers | 2 |
| Normalization / `&` / hyphen clashes | 1, 3 |
| Alphabetical `id` tie-break | 3 |
| AgentTool pack text handoff (not session state) | 6 |
| ~25 deep packs | 4 |
| Catalog + families JSON | 2, 3 |
| `select_genre_pack` + schema | 5 |
| Maintenance docs | 7 |
| No live API / no Veo changes | Global constraints |

## Placeholder scan

Plan avoids TBD/TODO. Deep pack prose is authored in Task 4 (not pasted in full here by design). Catalog seed content is authored in Task 3 with required fields listed.
