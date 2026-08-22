# Round 3 proof — Runic Depths

Generated from this worktree on 2026-08-22. Covers were rendered by
`node scripts/render-marketing.mjs`; previews were freshly captured with
`node scripts/record-video.mjs <landscape|portrait>` and composed by
`node scripts/compose-marketing-video.mjs <landscape|portrait>`.

## Media verification

`ffprobe -v error -show_entries stream=codec_type,width,height,sample_aspect_ratio:format=duration,size -of default=noprint_wrappers=1 <file>` produced:

| File | ffprobe evidence | Requirement result |
| --- | --- | --- |
| `marketing/cover-16x9.png` | video, 1920x1080, 956747 bytes | PASS — 16:9 |
| `marketing/cover-2x3.png` | video, 800x1200, 430784 bytes | PASS — 2:3 |
| `marketing/cover-1x1.png` | video, 800x800, 378208 bytes | PASS — 1:1 |
| `marketing/video-landscape.mp4` | video, 1920x1080, SAR 1:1, 16.533333s, 3672490 bytes | PASS — exact 16:9, silent video-only stream, 15–20s |
| `marketing/video-portrait.mp4` | video, 800x1200, SAR 1:1, 16.533333s, 2130301 bytes | PASS — exact 2:3, silent video-only stream, 15–20s |

Both previews concatenate the matching cover for an exact 0.7-second opening
hold before the freshly recorded gameplay segment. The cover source contains
only the game title; it has no borders, taglines, UI, or blurred screenshot
backdrop.

## Fresh visual captures

- `qa/round3-gameplay-907x510.png`
- `qa/round3-gameplay-1920x1080.png`
- `qa/round3-gameplay-390x844.png`

These capture the current build after a real first move, so the first-run
controls overlay has auto-dismissed and the gameplay HUD/layout is visible.

## Full isolated gate suite

`npm test` exited **0**. It rebuilt the current worktree and used the ephemeral
127.0.0.1 port allocated by `tests/run-gates.mjs`. Passing gates: E2E,
final-polish regressions, Round 3 code-layout/onboarding regression,
250-seed floor properties, viewport matrix (including 907x510 and 390x844),
60/144/165Hz refresh checks, and the accelerated 120-second soak.

The soak result was: `simulatedSeconds=120`, `floors=3`, `restarts=10`,
`maxParticles=235`, `maxFloaters=40`, `maxListeners=8`, `errors=[]`.
