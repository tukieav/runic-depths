# Runic Depths v2 submission media

Use these files for the current **The Hollow Covenant** game; the parent marketing directory contains historical v1 material.

| Asset | Size | Purpose |
| --- | --- | --- |
| `cover-16x9.png` | 1920 × 1080 | Landscape cover |
| `cover-1x1.png` | 800 × 800 | Square cover |
| `cover-2x3.png` | 800 × 1200 | Portrait cover |
| `video-landscape.mp4` | 1920 × 1080, 18 seconds | Landscape gameplay preview |
| `video-portrait.mp4` | 720 × 1080, 18 seconds | Portrait gameplay preview |

The previews are silent H.264 MP4 files. Each starts with its matching static cover for 0.5 seconds, followed by normal-speed gameplay. The source footage has no mouse cursor, letterboxing, loading screen, or debug overlay. `manifest.json` records the encoded dimensions, duration, file sizes, audio-track checks, asset provenance, and encounter staging.

The encounter is staged through the local QA interface before recording: a level 8 Arcanist with ordinary character stats enters the sixth-floor guardian arena. Combat then uses actual keyboard movement, attacks, abilities, and potions. No invulnerability or damage override is applied. End-state health and encounter status are recorded in the manifest. The additional PNG files show gameplay during each take.

Covers reuse the original generated character artwork documented in [asset provenance](../../assets/PROVENANCE.md). `cover.html` is a responsive HTML/CSS composition whose only copy is the game title. No external logos or third-party game artwork are included.

Reproduce after `npm run build`:

```bash
node scripts/marketing-v2.mjs
```

Requires Playwright, Chromium (`CHROME_PATH` can override `/usr/bin/google-chrome`), FFmpeg, and ffprobe. The script serves the current `dist/` locally on a random loopback port. `RUNIC_GAME_URL` can select another local build with `?qa=1`. `--covers-only` renders only the three covers.

Dimensions and preview restrictions were checked against the [official CrazyGames cover requirements](https://docs.crazygames.com/requirements/game-covers/) on 2026-09-05. This local media verification does not constitute platform review or publication approval.
