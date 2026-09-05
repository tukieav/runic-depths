import { copyFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
copyFileSync('index.html', 'dist/index.html');
if (existsSync('assets')) cpSync('assets', 'dist/assets', { recursive: true });
copyFileSync('node_modules/three/LICENSE', 'dist/THREE-LICENSE.txt');
console.log('dist/ ready: standalone relative-path build');
