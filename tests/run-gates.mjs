import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';

const dist = join(process.cwd(), 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const path = normalize((req.url || '/').split('?')[0]).replace(/^\.\.(?:[\\/]|$)/, '');
  const file = join(dist, path === '/' ? 'index.html' : path);
  if (!file.startsWith(dist) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const env = { ...process.env, PORT: String(port) };
const gates = ['tests/e2e.mjs', 'tests/final-polish-gate.mjs', 'tests/round3-compliance-gate.mjs', 'tests/floor-property-gate.mjs', 'tests/viewport-gate.mjs', 'tests/refresh-rate-gate.mjs', 'tools/e2e-soak.cjs'];
let status = 0;
for (const gate of gates) {
  const result = spawnSync(process.execPath, [gate], { stdio: 'inherit', env });
  if (result.status) { status = result.status; break; }
}
await new Promise(resolve => server.close(resolve));
process.exit(status);
