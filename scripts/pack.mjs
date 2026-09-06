import { copyFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
copyFileSync('index.html', 'dist/index.html');
// Rebuild the asset tree so retired models cannot linger in a release ZIP.
rmSync('dist/assets', { recursive: true, force: true });
if (existsSync('assets')) cpSync('assets', 'dist/assets', { recursive: true });
copyFileSync('node_modules/three/LICENSE', 'dist/THREE-LICENSE.txt');
console.log('dist/ ready: standalone relative-path build');
