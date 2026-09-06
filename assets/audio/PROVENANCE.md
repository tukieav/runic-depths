# The Bell Beneath — chamber score and sound design

All 26 Ogg files in this directory are original audio generated for Runic Depths.
They contain no downloaded recordings, music, soundfonts, third-party samples,
spoken dialogue, or sounds from Diablo or any other game.

Rebuild with `python3 scripts/build-audio-assets.py` (Python 3, NumPy, SciPy,
FFmpeg with libvorbis). The generator uses a fixed random seed and is included
as editable source. `manifest.json` records durations, hashes and descriptions.

Six stereo chapter compositions use an original eight-bar harmonic arc at
70 BPM, layered bowed-string spectra, breath/formant choir textures and brass
swells. A synchronized percussion stem follows combat intensity with a smooth
crossfade. Chapter changes retain musical phase. These are original synthetic
instruments, not a recorded orchestra or a claim of AAA production quality.

Nineteen short sound-design samples combine air displacement, modal metal/wood
resonances, body impacts, stone grit, glass motifs and nonverbal creature growls.
Playback varies pitch and alternates variants, with optional stereo placement.
The complete compressed collection is approximately 1.57 MiB. Loading starts
only after a gesture; only the current chapter is initially requested. Decode or
network failures retain the original finite procedural fallback. Pausing clears
all active voices and suspends WebAudio; no scheduling timers run in hidden tabs.
