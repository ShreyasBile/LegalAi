import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';      // this machine only; set HOST=0.0.0.0 to share it on your network
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(request.url.split('?')[0]); }
  catch { response.writeHead(400); response.end('Bad request'); return; }       // e.g. /%E0%A4
  const path = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': `${mime[extname(path)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache' });
  const stream = createReadStream(path);
  stream.on('error', () => { if (!response.headersSent) response.writeHead(500); response.end(); });
  stream.pipe(response);
}).listen(port, host, () => console.log(`LegalAI frontend ready at http://localhost:${port}`));
