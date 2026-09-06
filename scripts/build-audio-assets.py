#!/usr/bin/env python3
"""Deterministic original audio: spectral instruments, modal Foley and stereo rooms.

Requires Python 3, numpy, scipy and FFmpeg. No third-party recordings, soundfont,
music or samples. Runtime assets are Vorbis; intermediate PCM stays temporary.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io.wavfile import write

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/audio'
OUT.mkdir(parents=True, exist_ok=True)
SR = 32000
BEAT = 60 / 70
LOOP = BEAT * 32
RNG = np.random.default_rng(84621)
MANIFEST = []


def time(duration):
    return np.arange(round(duration * SR)) / SR


def filt(x, cutoff, kind='lowpass'):
    return sosfilt(butter(2, cutoff, kind, fs=SR, output='sos'), x)


def env(t, attack=.04, release=.3):
    return np.minimum(1, t / attack) * np.minimum(1, (t[-1] - t) / release)


def stereo(x, pan=0):
    return np.column_stack((x * np.sqrt((1 - pan) / 2), x * np.sqrt((1 + pan) / 2)))


def room(x, wet=.25, cyclic=False):
    out = x.copy()
    # Dense, diffused, finite room response, with decorrelated left/right echoes.
    for i in range(29):
        seconds = .057 + i * .041 + (i % 3) * .007
        delay = int(seconds * SR)
        gain = wet * np.exp(-seconds * 2.5) * (.75 if i % 2 else 1)
        reflection = np.roll(x[:, ::-1] if i % 2 else x, delay, axis=0)
        if not cyclic:
            reflection[:delay] = 0
        out += reflection * gain / 4
    return out


def instrument(freq, duration, family='strings', velocity=1):
    t = time(duration)
    x = np.zeros(len(t))
    # Realistic complexity comes from independently moving harmonics/ensembles,
    # filtered bow/air noise and a broad envelope, rather than a raw oscillator.
    for voice in range(4 if family == 'strings' else 3):
        detune = 1 + (voice - 1.5) * .0019
        vibrato = .003 * np.sin(2 * np.pi * (4.1 + voice * .37) * t)
        phase = np.cumsum(2 * np.pi * freq * detune * (1 + vibrato) / SR)
        for h in range(1, min(25, int(12000 / freq))):
            if family == 'choir':
                weight = sum(np.exp(-((freq * h - f) / width) ** 2) * g for f, width, g in [(650, 190, 1), (1150, 260, .6), (2500, 450, .16)]) / h ** .5
            elif family == 'horn':
                weight = np.exp(-h / 6) / h ** .65
            else:
                weight = (1 if h % 2 else .63) / h ** 1.22
            x += np.sin(phase * h + voice * .73) * weight
    x /= 4
    breath = filt(RNG.normal(size=len(t)), 3000) * .025
    amplitude = env(t, .7 if family != 'horn' else .35, .9)
    amplitude *= .72 + .28 * np.sin(np.pi * t / duration) ** 2
    return (x + breath) * amplitude * velocity


def add(track, sound, at, gain=1, pan=0, wrap=False):
    source = stereo(sound, pan) if sound.ndim == 1 else sound
    start = round(at * SR)
    if wrap:
        indices = (np.arange(len(source)) + start) % len(track)
        np.add.at(track, indices, source * gain)
    else:
        length = min(len(source), len(track) - start)
        if length > 0:
            track[start:start + length] += source[:length] * gain


def resonator(freqs, duration, decay=.25, strike=.2):
    t = time(duration)
    x = sum(np.sin(2 * np.pi * f * t) * np.exp(-t / (decay / (1 + i * .3))) / (1 + i) for i, f in enumerate(freqs))
    x += filt(RNG.normal(size=len(t)), 7000) * np.exp(-t / .016) * strike
    return x * np.minimum(1, t / .002)


def impact(duration=.5, heavy=False):
    t = time(duration)
    noise = RNG.normal(size=len(t))
    body = np.sin(2 * np.pi * (52 * t + 1.4 * (1 - np.exp(-t * 45)))) * np.exp(-t / (.19 if heavy else .08))
    crack = filt(noise, 4800) * np.exp(-t / .018) * .62
    gravel = filt(noise, 1700) * np.exp(-t / .1) * .25
    return (body + crack + gravel) * env(t, .002, .02)


def export(name, x, loop=False, description=''):
    if x.ndim == 1:
        x = stereo(x)
    peak = np.max(np.abs(x))
    # Leave headroom; master compressor is a safety net, not normal operation.
    target = .72 if loop else .82
    x = x / max(peak, .001) * target
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / 'source.wav'
        write(wav, SR, (x * 32767).astype(np.int16))
        path = OUT / f'{name}.ogg'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav), '-c:a', 'libvorbis', '-q:a', '1' if loop else '3', str(path)], check=True)
    MANIFEST.append({'id': name, 'file': path.name, 'seconds': round(len(x) / SR, 5), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'loop': loop, 'description': description})


chapter_names = ['Stone remembers', 'Roots of the forgotten', 'The glass archive', 'Embers of judgement', 'The drowned covenant', 'Light beneath the heart']
# Eight-bar original harmonic arc, shared pulse permits stem synchronization.
progressions = [[38, 45, 53], [34, 41, 50], [41, 48, 57], [36, 43, 52]]
for chapter in range(6):
    track = np.zeros((round(LOOP * SR), 2))
    for bar in range(4):
        for voice, pitch in enumerate(progressions[(bar + chapter % 2) % 4]):
            freq = 440 * 2 ** ((pitch - 69) / 12)
            add(track, instrument(freq, BEAT * 9, 'strings'), bar * BEAT * 8, .19, [-.5, .5, -.12][voice], True)
            if chapter in [0, 2, 4, 5]:
                add(track, instrument(freq * 2, BEAT * 8.5, 'choir'), bar * BEAT * 8 + .35, .13, .3 - voice * .3, True)
        if chapter in [1, 3, 5]:
            add(track, instrument(440 * 2 ** ((progressions[bar][0] - 69) / 12), BEAT * 5, 'horn'), (bar * 8 + 2) * BEAT, .16, -.2, True)
    # Sparse lyrical wood/string theme, with space between phrases.
    motif = [62, 65, 69, 67, 65, 60, 62, 57]
    for i, pitch in enumerate(motif):
        freq = 440 * 2 ** ((pitch - 69) / 12)
        family = 'strings' if chapter in [0, 1, 5] else 'choir'
        add(track, instrument(freq, BEAT * 2.8, family), (i * 4 + 1) * BEAT, .11, .15, True)
    wind = filt(RNG.normal(size=len(track)), 400) * .025
    track += stereo(wind, -.4)
    export(f'chapter-{chapter + 1}', room(track, .48, True), True, chapter_names[chapter])

combat = np.zeros((round(LOOP * SR), 2))
for beat in range(32):
    add(combat, impact(1.1, True), beat * BEAT, .55 if beat % 4 == 0 else .3, -.15 if beat % 2 else .15, True)
    if beat % 2:
        add(combat, resonator([171, 276, 402], .7, .12, 1), (beat + .5) * BEAT, .13, -.5, True)
    if beat % 4 == 3:
        add(combat, impact(.3), (beat + .75) * BEAT, .2, .5, True)
export('combat-stem', room(combat, .3, True), True, 'Synchronized low war drums and frame drums; eight bars at 70 BPM')

for variant in range(3):
    t = time(.42)
    whoosh = filt(RNG.normal(size=len(t)), 4200 + variant * 800) * np.exp(-((t - .12) / .055) ** 2)
    x = whoosh * .55
    strike = resonator([410 + variant * 80, 1170, 1963, 3410], .28, .14, .4)
    x[round(.14 * SR):] += strike[:len(x) - round(.14 * SR)] * .42
    export(f'blade-{variant + 1}', room(stereo(x, -.15 + variant * .15), .2), description='Layered air displacement, steel modal ring and contact')
    t = time(.23)
    x = filt(RNG.normal(size=len(t)), 800) * np.exp(-t / .032) + impact(.23) * .23
    x += filt(RNG.normal(size=len(t)), 3400) * np.exp(-((t - .025) / .035) ** 2) * .08
    export(f'step-{variant + 1}', x, description='Leather sole, heel body and stone grit')

export('impact', room(stereo(impact(.55)), .18), description='Weighted low body impact and dry transient')
export('bow', room(stereo(resonator([180, 423, 711], .5, .055, .65)), .2), description='Taut string snap and wooden limb resonance')
for variant in range(3):
    t = time(1.8)
    air = filt(RNG.normal(size=len(t)), 4200) * np.exp(-((t - .2) / .19) ** 2)
    x = air * .2
    for pitch in [62, 69, 74]:
        f = 440 * 2 ** ((pitch + variant * 2 - 69) / 12)
        x += resonator([f, f * 2.76, f * 4.05], 1.8, .5, 0) * .12
    x += np.sin(2 * np.pi * (72 * t + 8 * (1 - np.exp(-t * 5)))) * np.exp(-t / .25) * .5
    export(f'magic-{variant + 1}', room(stereo(x), .65), description='Crystalline spell resonance, air swell and subharmonic release')
for variant in range(2):
    t = time(.85 + variant * .2)
    phase = 2 * np.pi * (67 * t + 5 * (1 - np.exp(-t * 4)))
    vocal = sum(np.sin(phase * h) / h for h in range(1, 22))
    vocal = filt(vocal, [280, 2300], 'bandpass')
    vocal += filt(RNG.normal(size=len(t)), 1300) * .35
    vocal *= np.sin(np.pi * t / t[-1]) ** .7 * (1 + .28 * np.sin(2 * np.pi * 27 * t))
    export(f'creature-{variant + 1}', room(stereo(vocal), .35), description='Nonverbal fantastical creature breath and formant growl; no human recording')

for name, pitches, duration in [('loot', [81, 88], .65), ('rare', [74, 81, 86, 89], 2), ('level', [62, 65, 69, 74, 77], 2.4), ('potion', [69, 76, 81], 1.0), ('ui', [78], .16)]:
    track = np.zeros((round(duration * SR), 2))
    for i, pitch in enumerate(pitches):
        freq = 440 * 2 ** ((pitch - 69) / 12)
        add(track, resonator([freq, freq * 2.004, freq * 3.96], duration - i * .09, duration / 3, .04), i * .09, .25, -.2 + i * .1)
    export(name, room(track, .4), description='Original resonant metal/glass UI or reward motif')
track = np.zeros((SR * 3, 2))
for pitch in [26, 33, 38]:
    add(track, instrument(440 * 2 ** ((pitch - 69) / 12), 3, 'horn'), 0, .35)
add(track, impact(2, True), 0, .6)
export('boss', room(track, .55), description='Low brass threat swell and chamber impact')
(OUT / 'manifest.json').write_text(json.dumps({'title': 'The Bell Beneath — chamber score and sound design', 'author': 'Original Runic Depths procedural composition', 'sampleRate': SR, 'tempo': 70, 'loopSeconds': LOOP, 'generator': 'scripts/build-audio-assets.py', 'assets': MANIFEST}, indent=2) + '\n')
print(f'Generated {len(MANIFEST)} assets, {sum(a["bytes"] for a in MANIFEST) / 1024 ** 2:.2f} MiB')
