// Prefix fresh raw gameplay with the matching cover, producing a silent,
// reviewer-ready preview with an exact 0.7s cover opening frame.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2] || 'landscape';
const portrait = mode === 'portrait';
const size = portrait ? '800:1200' : '1920:1080';
const cover = portrait ? 'marketing/cover-2x3.png' : 'marketing/cover-16x9.png';
const raw = `marketing/raw-${mode}.webm`;
const out = `marketing/video-${mode}.mp4`;
if (!existsSync(raw)) throw new Error(`Missing ${raw}; run record-video.mjs ${mode} first.`);

const filter = `[0:v]scale=${size}:flags=lanczos,setsar=1,trim=duration=0.7,setpts=PTS-STARTPTS[cover];` +
  `[1:v]scale=${size}:flags=lanczos,setsar=1,trim=duration=15.8,setpts=PTS-STARTPTS[game];` +
  `[cover][game]concat=n=2:v=1:a=0[out]`;
const result = spawnSync('ffmpeg', [
  '-y', '-loop', '1', '-i', cover, '-ss', '1.0', '-i', raw,
  '-filter_complex', filter, '-map', '[out]', '-an', '-r', '30',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
console.log('composed', out);
