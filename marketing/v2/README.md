# Runic Depths 2.2 submission media

Use these files for the current **The Hollow Covenant** game with the 2.2
graphics and sound upgrade; the parent marketing directory contains historical v1 material.
The directory name remains `v2` to preserve the release-kit paths.

| Asset | Size | Purpose |
| --- | --- | --- |
| `cover-16x9.png` | 1920 × 1080 | Landscape cover |
| `cover-1x1.png` | 800 × 800 | Square cover |
| `cover-2x3.png` | 800 × 1200 | Portrait cover |
| `video-landscape.mp4` | 1920 × 1080, 18 seconds | Landscape gameplay preview |
| `video-portrait.mp4` | 720 × 1080, 18 seconds | Portrait gameplay preview |

The previews are silent H.264 MP4 files. Each starts with its matching static cover for 0.5 seconds, followed by input-driven gameplay without time scaling. The source footage has no mouse cursor, letterboxing, loading screen, or debug overlay. `manifest.json` records the encoded dimensions, duration, file sizes, audio-track checks, asset provenance, encounter staging, decoded asset status, actual animation-frame count, wall-clock and simulated durations, and SHA-256 hashes of the captured build and asset manifests. Software rendering can reduce simulation progress; encoded 30 fps is not a claim of 30 fps game rendering.

The footage shows the detailed animated GLB characters, original PBR surfaces,
varied gothic architecture and sculpted environment props. These videos use
High graphics at full internal pixel ratio 1.0, including HDR bloom, contact
shading, dynamic shadows and point lights. ANGLE/OpenGL selects the host NVIDIA
GeForce RTX 4090; the actual WebGL renderer and capture timing are recorded for
each take. This is an
actual game capture, not an offline renderer or a representative performance
benchmark for low-end devices.

The final landscape and portrait takes averaged 59.25 and 59.86 browser animation
frames per second. Each captured approximately 17.5 seconds of simulation in
17.5 seconds of wall-clock time; the encoded previews include the opening cover.

The encounter is staged through the local QA interface before recording: a level 8 Arcanist with ordinary character stats enters the sixth-floor guardian arena. Combat then uses actual keyboard movement, attacks, abilities, and potions. No invulnerability or damage override is applied. End-state health and encounter status are recorded in the manifest. The additional PNG files show gameplay during each take.

Covers reuse the original generated character artwork documented in [asset provenance](../../assets/PROVENANCE.md). `cover.html` is a responsive HTML/CSS composition whose only copy is the game title. No external logos or third-party game artwork are included.

Reproduce after `npm run build`:

```bash
RUNIC_CAPTURE_GPU=hardware RUNIC_CAPTURE_QUALITY=high RUNIC_CAPTURE_PIXEL_RATIO=1 node scripts/marketing-v2.mjs
```

Requires Playwright, Chromium (`CHROME_PATH` can override `/usr/bin/google-chrome`), FFmpeg, ffprobe, and an available OpenGL GPU for the command above. The script serves the current `dist/` locally on a random loopback port. `RUNIC_GAME_URL` can select another local build with `?qa=1`. The default is software capture, High graphics at pixel ratio 0.8; `RUNIC_CAPTURE_QUALITY=low` selects Performance graphics. Hardware capture explicitly requests ANGLE/OpenGL and rejects a SwiftShader/llvmpipe fallback. Settings and actual renderer are recorded in the manifest. `--covers-only` renders only the three covers.

Dimensions and preview restrictions were checked against the [official CrazyGames cover requirements](https://docs.crazygames.com/requirements/game-covers/). The capture script verifies 15–20 second duration, exact encoded dimensions, no audio stream, and an unchanged build throughout capture. This local media verification does not constitute platform review or publication approval.
