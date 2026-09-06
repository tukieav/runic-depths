import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = resolve('dist');
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(root).sort(),
  bytes = files.reduce((n, p) => n + statSync(p).size, 0);
if (files.length > 1500 || bytes > 20 * 1024 * 1024)
  throw Error('Bundle exceeds conservative CrazyGames mobile package budget');
for (const file of [
  'index.html',
  'bundle.js',
  'bundle.css',
  'assets/hero-atlas.png',
  'THREE-LICENSE.txt',
])
  if (!files.includes(join(root, file))) throw Error(`Missing ${file}`);
mkdirSync('releases', { recursive: true });
const target = resolve('releases/runic-depths-covenant-v2.zip');
const script =
  'import pathlib,sys,zipfile\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for p in sorted(root.rglob("*")):\n  if p.is_file(): z.write(p,p.relative_to(root))\n';
const zip = spawnSync('python3', ['-c', script, root, target], { encoding: 'utf8' });
if (zip.status !== 0) throw Error(zip.stderr || 'ZIP packaging failed; Python 3 required');
const manifest = {
  title: 'Runic Depths: The Hollow Covenant',
  version: JSON.parse(readFileSync('package.json', 'utf8')).version,
  generatedAt: new Date().toISOString(),
  fileCount: files.length,
  uncompressedBytes: bytes,
  zipBytes: statSync(target).size,
  sha256: createHash('sha256').update(readFileSync(target)).digest('hex'),
  files: files.map((p) => ({
    path: p.slice(root.length + 1),
    bytes: statSync(p).size,
    sha256: createHash('sha256').update(readFileSync(p)).digest('hex'),
  })),
  verification:
    'Local automated tests and package checks. CrazyGames portal acceptance and physical-device QA are separate.',
};
writeFileSync('releases/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      archive: target,
      files: files.length,
      uncompressedMB: (bytes / 1024 / 1024).toFixed(2),
      zipMB: (statSync(target).size / 1024 / 1024).toFixed(2),
      sha256: manifest.sha256,
    },
    null,
    2,
  ),
);
// The game ZIP is directly uploadable. The optional submission kit keeps portal
// images/videos and the honest QA notes beside it, outside the playable bundle.
const mediaNames = [
  'cover-16x9.png',
  'cover-1x1.png',
  'cover-2x3.png',
  'video-landscape.mp4',
  'video-portrait.mp4',
];
const { existsSync } = await import('node:fs');
if (mediaNames.every((name) => existsSync(join('marketing/v2', name)))) {
  const kit = resolve('releases/runic-depths-submission-kit-v2.zip');
  const entries = [
    [target, 'runic-depths-covenant-v2.zip'],
    ...mediaNames.map((name) => [resolve('marketing/v2', name), 'media/' + name]),
    [resolve('marketing/SUBMISSION.md'), 'SUBMISSION.md'],
    [resolve('qa/ARPG_AUDIT.md'), 'QA.md'],
    [resolve('qa/PLATFORM_REQUIREMENTS.md'), 'PLATFORM_REQUIREMENTS.md'],
    [resolve('releases/manifest.json'), 'manifest.json'],
  ];
  const pack =
    'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n for source,name in json.loads(sys.argv[2]): z.write(source,name)\n';
  const result = spawnSync('python3', ['-c', pack, kit, JSON.stringify(entries)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw Error(result.stderr || 'Submission kit packaging failed');
  console.log(
    'Submission kit: ' + kit + ' (' + (statSync(kit).size / 1024 / 1024).toFixed(2) + ' MB)',
  );
}
