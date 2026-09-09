# Hybrid genre catalog design

Date: 2026-09-09

## Goal
Expand Creative Director beyond dark-pop / hip-hop / generic so briefs can name any Apple Music or Spotify genre. Recognize the full catalog; ship ~25 deep visual packs; expand everything else from style-family templates.

## Decisions
- Coverage mode: **hybrid** (full catalog recognition + deep packs for priority tier).
- Catalog source: **both** Apple Music and Spotify, normalized into one internal list with aliases.
- Deep pack tier (v1): **~25** handcrafted markdown packs.
- Non-deep genres: **template expansion** via style families at runtime (not one file per seed, not on-demand LLM packs).
- Catalog data: **static JSON checked into the repo** for v1. Live API sync is out of scope.
- Pack handoff to specialists: **AgentTool call text** (not session state). The director pastes `pack` markdown into the `writer_agent` / `dp_agent` tool invocation message.

## Approach
Catalog + deep packs + family templates (Approach 1).

## Data model

### Catalog (`data/genres/catalog.json`)
Normalized entries:
- `id` — stable internal slug
- `label` — display name
- `appleAliases` — Apple Music wording variants
- `spotifyAliases` — Spotify seed / genre wording variants
- `family` — style family id used when no deep pack applies
- `deepPack` — optional deep pack id (one of the ~25)

### Style families (`data/genres/families.json`)
Small fixed set: `urban`, `electronic`, `pop`, `rock`, `acoustic`, `global`, `metal`, `dance`, `jazz-soul`, `experimental`.

Each family supplies template fields used by the expander:
- `palette` → **Visual Palette**
- `motifs` → **Core Motifs**
- `camera` → **Camera & Pacing**
- `writer` → **Narrative & Stylistic Directives**

### Deep packs (`skills/genres/*.md`)
Handcrafted visual bibles. New and migrated packs use the same section headers as templates (below). Generic last resort remains `skills/craft/music-video.md`.

### Pack markdown format (templates and deep packs)
Template expansion **must** emit this shape so Writer/DP always see the same headings:

```markdown
# [Genre Label] Visual Bible (Family: [Family ID])

## Visual Palette
...

## Core Motifs
...

## Camera & Pacing
...

## Narrative & Stylistic Directives
...
```

Deep packs use the same four `##` headers (title line may omit `(Family: …)` and name the deep pack instead).

### Resolver result
Returned by `select_genre_pack` / `resolveGenrePack`:

```ts
export type GenrePackSource = 'deep' | 'template' | 'generic';

export interface GenrePackResolution {
  catalogGenre: string;
  packId: string;
  source: GenrePackSource;
  pack: string;
  aliasesMatched?: string[];
  /** Present when a deep pack was requested but the file was missing, etc. */
  warning?: string;
}
```

### Alias normalization
Before matching, normalize both the brief tokens and every alias with `normalizeGenreKey(s)`:

1. Unicode NFKC
2. Lowercase
3. Trim
4. Replace `&` with ` and `
5. Replace any run of whitespace or `_` with a single space
6. Treat hyphens and spaces as equivalent for comparison (collapse `[-\\s]+` to a single space after step 5)

Examples that must collide to the same key: `R&B`, `r-and-b`, `r and b`, `R And B`.

### Resolution order
1. Exact alias match after normalization (Apple or Spotify) → catalog entry  
2. Substring / token match of normalized aliases inside the normalized brief (prefer **longest** matching alias string)  
3. Family template from matched entry (or best family guess from tokens)  
4. Generic craft pack  

**Tie-break** when multiple aliases share identical specificity (same match length): prefer entries with `deepPack` over template-only; then sort alphabetically by catalog `id` and take the first.

Missing deep pack file for an entry marked `deepPack`: fall back to that entry’s family template, set `source: 'template'`, and set `warning` to a clear string (e.g. `Deep pack file missing for dark-pop; using family electronic template.`).

## Deep packs (v1 target)
Keep: `dark-pop`, `hip-hop`

Add: `pop`, `r-and-b`, `soul`, `afrobeats`, `amapiano`, `latin`, `reggaeton`, `k-pop`, `country`, `rock`, `indie`, `metal`, `punk`, `edm`, `house`, `techno`, `drill`, `grime`, `jazz`, `blues`, `folk`, `gospel`, `classical-cinematic`

Ids may be adjusted slightly during implementation for cleaner alias mapping. Count stays ~25.

## Agent / tool flow
- Upgrade `lib/genre.ts` and `select_genre_pack` to the catalog resolver (replace the 3-regex path).
- Tool input remains the user brief; output is `GenrePackResolution` including full `pack` markdown and optional `warning`.
- Director instructions: call `select_genre_pack`, then when invoking `writer_agent` / `dp_agent`, **include the returned `pack` text verbatim in the tool call message** along with `catalogGenre`, `packId`, and `source`. Do not rely on session state for pack transfer in v1.
- Writer/DP agents: stop inlining every deep pack into the system prompt; instruct them to follow the pack text the director pasted. Keep shared craft skills (`beat-sync`, `veo-prompting`, generic music-video fallback) in the specialist prompts.
- Director / package shape: stop hardcoding “dark-pop | hip-hop | generic”; name `catalogGenre` + `source` (+ `warning` if any) in the final package.
- `production-package` schema: `genre` becomes `z.string().min(1)` (catalog or pack id), not a 3-value enum.

Unchanged: render pipeline, A2A swarm wiring (`specialistAgentTool`), Grafana MCP.

## Testing
- Normalization: `r&b` / `r-and-b` / `r and b` resolve identically.
- Resolver: known aliases → correct deep pack; known non-deep catalog genre → family template with required headers; nonsense → generic.
- Missing deep pack file → template + `warning` set.
- Tie-break: equal-length clashes sort alphabetically by `id` after deep preference.
- Template renderer: every family produces non-empty sections under the four required headers.
- Tool smoke: `select_genre_pack` returns `source` + usable `pack` markdown.
- Schema: production package accepts arbitrary genre id strings.

## Maintenance
- Document how to add a catalog alias, map a family, or promote a genre to a deep pack.
- Catalog updates are PR-based JSON edits until a future sync job exists.
- v1 catalog must cover all 25 deep packs with Apple+Spotify aliases plus enough non-deep seeds per family to exercise templates; further seeds land via follow-up PRs.

## Out of scope (v1)
- Live Spotify / Apple Music API sync
- One markdown file per catalog seed
- On-demand LLM-generated packs as the primary path
- Session-state injection of pack text
- Changing Veo / Pixels / C2PA tooling
