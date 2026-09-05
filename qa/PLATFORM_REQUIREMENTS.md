# CrazyGames readiness: integration contract and outstanding external checks

Reviewed official documentation on 2026-09-05. This is an engineering checklist, **not a CrazyGames acceptance certificate**. Portal approval, audience suitability and commercial performance remain external decisions.

## SDK implementation

`src/sdk.js` loads `https://sdk.crazygames.com/crazygames-sdk-v3.js`, awaits v3 initialization, bounds total loading/initialization to 4.5 seconds, deduplicates concurrent initialization, and avoids module calls when the SDK reports `disabled`. Localhost runs without network by default; append `?useLocalSdk=true` to exercise the real local SDK. Published builds attempt the SDK loader. A failed CDN/init leaves the game playable offline. No additional SDK script belongs in `index.html`.

Official source: [SDK introduction and environments](https://docs.crazygames.com/sdk/intro/). The old `/sdk/html5-v3/intro/` documentation URL returned 404 during review.

## Required gameplay integration

| Contract | Implementation / verification |
| --- | --- |
| Gameplay boundaries track actual playable state | Idempotent start/stop with no time throttle. Call stop for menus, pause, death, victory, hidden tab and lost focus; start only on actual return to play. |
| Portal audio mute takes priority | Bind SDK settings to `audio.setPlatformMuted`. Local `setMuted` and sliders cannot override it. Listener receives initial setting and returns an unsubscribe function. |
| Loading events are paired | Optional loadingStart/loadingStop are separately idempotent. |
| Happy time celebrates achievements | Only achievement events should call it; wrapper throttles at 1.5 seconds. |

[Official game/settings API](https://docs.crazygames.com/sdk/game/).

## Persistence

The SDK Data Module is authoritative while available, for guests and signed-in users. An absent cloud key remains absent; the wrapper must not restore an unrelated local account's save. Outside the SDK, localStorage persists saves; denied storage degrades to an in-memory session copy and reports failure through `getSDKStatus().dataError`. `saveData()` returns durability success/failure. Session memory cannot survive refresh.

The platform automatically reloads Data Module games on login; logout also reloads the page. A custom auth listener is unnecessary for this game, which has no private account backend. [Official account lifecycle](https://docs.crazygames.com/sdk/user/#auth-listener).

**Developer Portal prerequisite:** enable the submission's Progress Save setting. Test an actual guest save, sign-in transfer, cross-device load, account switch, and storage-denied behavior in portal preview. No login, email address, third-party analytics or account UI is added by this game.

[Official Data Module requirements](https://docs.crazygames.com/sdk/data/).

## Audio

`src/audio.js` synthesizes the original score “The Bell Beneath”: six chapter arrangements, minor-mode bell motifs, layered pads, finite echoes and combat percussion. No music/sample downloads or licensed recordings. SFX include class-sensitive skills, footsteps, spells, impact, potion, chest, rarity pickup, boss, level-up and ending cues. Independent master/music/SFX controls and a soft compressor bound loudness. WebAudio is constructed only by `unlockAudio()` from a user gesture. Music scheduling is driven by game updates; pause stops active voices, suspends the context and prevents new sound. Hidden documents cannot schedule sound. Touch/pointer recovery handles interrupted contexts when the game is resumed.

Hardware checks still needed: Safari/iOS interruption and gesture recovery, Android app interruption, headphones/speaker comfort over a full chapter, and low-memory mobile audio stability. [Official interruption guidance](https://docs.crazygames.com/requirements/technical/#resuming-audio-after-ios-interrupts-it).

## Package and device audit

Verify the final generated package: total ≤250 MB, at most 1500 files, initial load ≤50 MB (≤20 MB for mobile homepage). Use relative bundle asset paths. Verify Chrome and Edge, Safari where supported, and a physical 4 GB Chromebook. Mobile requires usable touch controls and safe-area accommodation. Full integration requires appropriate gameplay events and progress storage; loading events are optional. Basic Launch does not allow ads. [Technical requirements](https://docs.crazygames.com/requirements/technical/).

At DPR 1, inspect 907×510, 1216×684, 1077×606, 821×462, 1366×768, 1920×1080, 1536×864 and 1280×720; mobile 800×450 and tablet 1080×607. Verify frame-independent simulation at 60/120/144/165 Hz. English is required, and locale comes from SDK system information when available; other locales fall back to English. Polish can be explicitly selected. A fresh player must reach gameplay within one click for Full Implementation. Do not add a custom fullscreen button or in-game promotions. The content target is stylized PEGI-12-compatible fantasy; CrazyGames itself serves ages 13+. [Gameplay requirements](https://docs.crazygames.com/requirements/gameplay/).

Quality review must additionally assess quick understandable onboarding, clear goals, responsive controls, readable UI, comfortable sound and original assets. Human review of the final visual/audio experience is required beyond automated checks. [Quality guidelines](https://docs.crazygames.com/requirements/quality/).

## Advertising

The core game should make no ad requests. The retained optional wrapper resolves unavailable/failed ads as false and grants no pretend reward. Successful SDK callback is required for true. If monetization is later enabled, pause gameplay/audio on adStarted and restore the prior state on finish/error. No external advertising or monetization library is included.

## Local regression evidence

Run `node --test tests/sdk.test.mjs tests/audio.test.mjs` (12 tests passed) and `node tests/audio-browser.mjs` (real installed Google Chrome passed: context locked before gesture, 8 active music/effect voices after click, suspended with 0 voices on pause, no console warnings/errors). Set `CHROME_BIN` if Chrome is installed at another path.

Covered cases: rapid paired gameplay boundaries; duplicate load events; settings registration before initialization and unsubscribe; authoritative cloud reads; offline and blocked local storage; no offline ad rewards; timeout and late initialization; delayed CDN injection; shared initialization; disabled environments; ad callback errors and double outcomes; no autoplay context on boot; unsupported WebAudio; all original effects/chapter scheduling; portal mute priority; hidden/pause suppression; volume bounds.

These tests use controlled mocks. They do not prove live CrazyGames SDK transport, portal configuration, cross-device cloud behavior, real advertisement delivery, physical hardware performance, subjective content approval, retention metrics, or platform acceptance. Record those as pending until independently observed in the CrazyGames Developer Portal and required devices.

## Bundled-game integration audit

`node tests/platform-browser.mjs` passed eight checks against the actual `dist/bundle.js` in installed Google Chrome. The test serves a real 907×510 iframe, injects a clearly mocked SDK contract before boot, and observes callbacks from actual UI/lifecycle handlers. Five immediate pause/resume cycles retain all ten boundaries. Inventory freezes simulation and clears sound; a modal key gesture does not revive the soundtrack. Moving focus to an outside portal button pauses the iframe, and visibility loss pauses until explicit resume. Portal mute remains authoritative through actual audio button toggles. SDK locale selects Polish; absent SDK locale defaults to English even with a Polish browser. Denied local storage keeps the game playable and shows a visible mobile save failure. SDK initialization rejection also leaves gameplay available. No console/page errors were observed. Machine-readable evidence: `qa/arpg/platform-results.json`.

Integration findings resolved: the campaign now has six distinct score arrangements, main uses strict English fallback when SDK locale is absent, and failed-save status is visible on mobile with a one-time explanatory toast. Modal UI feedback is intentional; it resumes an empty audio context after pause has stopped all musical voices. Music only schedules while the simulation is playing.

The visibility test dispatches the browser visibility event with a controlled hidden state; the focus-loss test uses real iframe/parent focus movement. These checks still do not substitute for the live portal or physical device checks listed above.

## Hosted SDK local-environment check

The final bundle was additionally opened with `?qa=1&useLocalSdk=true` in real Chrome. The unmocked SDK loaded from its official hosted URL, initialized with environment `local`, and reported active gameplay with no storage error or browser console warning/error. Exact bundle SHA and the observed result are recorded in `qa/arpg/live-sdk-local.json`. This validates the hosted SDK API in local development; it does not establish portal account persistence or CrazyGames acceptance.
