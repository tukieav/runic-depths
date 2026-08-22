# Round 4 proof — Runic Depths

Generated from this worktree on 2026-08-22. The cover renderer was refreshed
as a bright, procedural knight-versus-monster tableau; no screenshot/UI text is
used in a cover and the title is its only wording. The menu screenshot was
recaptured after its brighter, warm rune-entry treatment.

## Cover brightness gate

The old rejection baseline recorded in the task brief was `darkFrac=0.87` for
this game. `node tests/cover-brightness-gate.mjs` exited **0** against the
freshly rendered PNGs. Required limits are mean luminosity >= 80, dark fraction
<= 0.35, and mean saturation >= 0.35.

| Cover | meanLum | darkFrac | meanSat | Result |
| --- | ---: | ---: | ---: | --- |
| `cover-16x9.png` | 134.02 | 0.0000 | 0.4871 | PASS |
| `cover-2x3.png` | 133.67 | 0.0000 | 0.4600 | PASS |
| `cover-1x1.png` | 133.74 | 0.0000 | 0.4572 | PASS |

## Media verification

`ffprobe -v error -show_entries stream=codec_type,width,height,sample_aspect_ratio:format=duration,size -of default=noprint_wrappers=1` produced:

| File | Evidence | Result |
| --- | --- | --- |
| `marketing/cover-16x9.png` | 1920x1080, 945997 bytes | PASS — 16:9 |
| `marketing/cover-2x3.png` | 800x1200, 485258 bytes | PASS — 2:3 |
| `marketing/cover-1x1.png` | 800x800, 347920 bytes | PASS — 1:1 |
| `marketing/video-landscape.mp4` | video-only, 1920x1080, SAR 1:1, 16.533333s, 3416470 bytes | PASS — silent 16:9, 15–20s |
| `marketing/video-portrait.mp4` | video-only, 800x1200, SAR 1:1, 16.533333s, 1792826 bytes | PASS — silent 2:3, 15–20s |

Both previews begin with a 0.7-second hold of their freshly rendered matching
cover, followed by a newly recorded gameplay segment. Reviewer captures are
`qa/round4-cover-907x510.png` and `qa/round4-menu-907x510.png`.

## Commands and gates

All commands below exited **0**:

- `npm run build`
- `PORT=8743 node scripts/render-marketing.mjs` against this worktree's
  loopback-only isolated static server
- `PORT=8743 node scripts/round4-shots.mjs`
- `PORT=8743 node scripts/record-video.mjs landscape`
- `node scripts/compose-marketing-video.mjs landscape`
- `PORT=8743 node scripts/record-video.mjs portrait`
- `node scripts/compose-marketing-video.mjs portrait`
- `node tests/cover-brightness-gate.mjs`
- `npm test` — build plus an ephemeral 127.0.0.1 server. Passing gates: E2E,
  final-polish regression, Round 3 compliance, 250 seeded floor properties,
  viewport matrix, 60/144/165 Hz refresh behavior, and accelerated 120-second
  soak.

Soak evidence: `simulatedSeconds=120.00000000000122`, `floors=3`,
`restarts=10`, `maxParticles=183`, `maxFloaters=29`, `maxListeners=8`,
`errors=[]`, `pass=true`.
