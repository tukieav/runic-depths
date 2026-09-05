# Asset provenance

- `hero-atlas.png`: original five-character portrait atlas generated for Runic Depths on 2026-09-05 with OpenAI image generation. No reference image, existing game artwork, logo, or named artist was supplied. Used on the optional character-selection panel.
- All dungeon architecture, material patterns, creatures, hero models, spell effects and interface ornament are procedural code in `src/renderer.js` and `src/style.css`.
- Campaign, characters and bilingual text are authored for this game in `src/content.js` and `src/i18n.js`.
- Music “The Bell Beneath” and sound effects are synthesized in `src/audio.js`, with no downloaded music recordings or samples.
- Three.js is distributed under its MIT license; the shipping bundle includes `THREE-LICENSE.txt`.
- CrazyGames SDK v3 is loaded from its official hosted endpoint when applicable; it is not redistributed inside the ZIP.
