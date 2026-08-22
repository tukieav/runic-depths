# Final polish audit — Runic Depths

Audited on 2026-08-22 against the current hardened build at 907×510,
1920×1080, and 390×844. The existing viewport, lifecycle, seeded-floor,
refresh-rate, and soak hardening were left intact. These are the **only three
reproduced defects** found in the requested focus areas.

## 1. A level-up can permanently lock the run

- **Reproduction:** start seed `17`, set the resolution delay to 1 ms, play
  normally until a combat kill opens the level-up cards, wait 180 ms to read
  them, choose a card, then press the displayed stairs direction. The captured
  state remains `state: "playing", turnPhase: "resolving"` and the hero does
  not move.
- **Impact:** a player who reads the upgrade choice loses all input after a
  legitimate kill; this is a run-ending replay-friction/input-transition bug.
- **Root cause:** `gainXp` changes state to `levelup` while `tryMove` still
  schedules `endPlayerTurn` (`src/main.js:472-503`, `345-369`). Its timer
  returns when it sees `state !== "playing"`, leaving the phase as
  `resolving` (`src/main.js:546-558`); `pickCard` only restores `state`
  (`516-523`).
- **Evidence:** automated live state above, plus the visible level-up overlay
  at the 907×510 audit viewport. This occurs only when the player spends more
  than the 120 ms resolution delay on the card, which is normal reading time.

## 2. Slow enemies promise a move on a turn they will skip

- **Reproduction:** reach an ogre (or any `slow` monster), end a player turn
  immediately before its even-numbered monster turn, and read its on-sprite
  label. It says `MOVE`; after resolving, the ogre does not act.
- **Impact:** the main tactical/readability aid gives a false forecast exactly
  when a player decides whether to spend a turn attacking, drinking, or taking
  cover. This is especially misleading at the small 907×510 viewport where the
  concise label is the intended combat cue.
- **Root cause:** `monstersAct` skips slow monsters after incrementing to an
  even `turnCount` (`src/main.js:580-583`), but `monsterIntent` has no slow
  wait branch and returns `MOVE` (`src/main.js:630-635`); the stale label is
  rendered directly above the sprite (`src/main.js:1257-1261`).
- **Evidence:** deterministic control-flow state: with current turn count 1,
  the next enemy phase becomes 2 and skips; the rendered intent still resolves
  to `{ id: "move", label: "MOVE" }`.

## 3. Rune pillars charge two dangerous turns without tactical payoff

- **Reproduction:** on seed `17`, enter the first non-start room containing
  the central purple pillar. It can be walked around in the open room; bump it
  twice. Each bump consumes a player turn and lets all enemies respond, then
  the result claims `PATH OPEN` although no route had been sealed or reward
  supplied.
- **Impact:** the advertised rune terrain reads as a tactical object but is a
  two-turn tax. During a combat room this creates avoidable damage without a
  compensating choice, weakening generated-floor pacing and fairness.
- **Root cause:** generation always puts the pillar only at a room centre,
  rather than tying it to a contested encounter (`src/main.js:255-263`), while
  `tryMove` always ends the player turn on a strike (`345-355`). Destruction
  merely changes that one bypassable floor cell back to walkable and emits the
  misleading route message (`372-383`).
- **Evidence:** seed `17` current state reports `runePillarCount: 1` with
  `stairsReachable: true`; the open-room layout has a path around the centre
  both before and after destruction. The 907×510 capture makes the `RUNE 2/2`
  marker and its unsupported `PATH OPEN` expectation visible.
