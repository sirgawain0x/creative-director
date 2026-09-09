# Beat sync

Convert tempo into an edit grid the DP and editor can share.

- Ask for BPM. If missing, infer a working tempo from the brief and label it assumed.
- Scene durations should land on bars (4/4: 2, 4, or 8 bars) unless the brief asks for a smash cut.
- Timecodes as `MM:SS`. Intro / verse / pre-chorus / chorus / outro should each have at least one scene when the clip is long enough.
- Visual intensity follows the mix: quieter sections = slower camera; drop/chorus = faster moves or a new location.
- Editor: pass `target_bpm` into assembly. Prefer hard cuts on downbeats over dissolves unless the genre pack says otherwise.
