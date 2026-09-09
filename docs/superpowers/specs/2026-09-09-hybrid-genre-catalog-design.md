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
Small fixed set, e.g. `urban`, `electronic`, `pop`, `rock`, `acoustic`, `global`, `metal`, `dance`, `jazz-soul`, `experimental`.

Each family supplies template fields: palette, motifs, camera, writer notes.

### Deep packs (`skills/genres/*.md`)
Handcrafted visual bibles (same shape as today’s dark-pop / hip-hop).

Generic last resort remains `skills/craft/music-video.md`.

### Resolver result
Returned by `select_genre_pack`:

```ts
{
  catalogGenre: string;
  packId: string;
  source: 'deep' | 'template' | 'generic';
  pack: string;
  aliasesMatched?: string[];
}
```

### Resolution order
1. Exact alias match (Apple or Spotify) → catalog entry  
2. Fuzzy / token match on brief  
3. Family template from matched entry (or best family guess)  
4. Generic craft pack  

Ambiguous ties: prefer longest / most specific alias; if still tied, prefer deep pack over template, then stable sort by `id`. Include `aliasesMatched` for transparency.

Missing deep pack file for an entry marked `deepPack`: fall back to that entry’s family template and surface a warning in the tool result.

## Deep packs (v1 target)
Keep: `dark-pop`, `hip-hop`

Add: `pop`, `r-and-b`, `soul`, `afrobeats`, `amapiano`, `latin`, `reggaeton`, `k-pop`, `country`, `rock`, `indie`, `metal`, `punk`, `edm`, `house`, `techno`, `drill`, `grime`, `jazz`, `blues`, `folk`, `gospel`, `classical-cinematic`

Ids may be adjusted slightly during implementation for cleaner alias mapping. Count stays ~25.

## Agent / tool flow
- Upgrade `lib/genre.ts` and `select_genre_pack` to the catalog resolver (replace the 3-regex path).
- Tool input remains the user brief; output is the richer resolver result including full `pack` markdown.
- Director / Writer / DP instructions stop hardcoding “dark-pop | hip-hop | generic”. They apply whatever pack `select_genre_pack` returned and name `catalogGenre` + `source` in the package.
- Writer/DP agents stop inlining every deep pack into the system prompt; prefer pack text passed from the director (keeps context small as packs grow).
- `production-package` schema accepts catalog / pack ids as strings (not a 3-value enum).

Unchanged: craft skills (`beat-sync`, `veo-prompting`), render pipeline, A2A swarm wiring.

## Testing
- Resolver: known aliases → correct deep pack; known non-deep catalog genre → family template; nonsense → generic.
- Template renderer: every family produces non-empty palette / motifs / camera / writer sections.
- Tool smoke: `select_genre_pack` returns `source` + usable `pack` markdown.
- Schema: production package accepts new genre ids.

## Maintenance
- Document how to add a catalog alias, map a family, or promote a genre to a deep pack.
- Catalog updates are PR-based JSON edits until a future sync job exists.

## Out of scope (v1)
- Live Spotify / Apple Music API sync
- One markdown file per catalog seed
- On-demand LLM-generated packs as the primary path
- Changing Veo / Pixels / C2PA tooling
