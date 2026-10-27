import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

export function createStaticServer(root = fileURLToPath(new URL('../public/', import.meta.url))) {
  const base = resolve(root);
  const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8' };
  return createServer(async (req, res) => {
    const headers = { 'X-Robots-Tag':'noindex, nofollow, noarchive', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, {...headers, Allow:'GET, HEAD'}).end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const target = resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(base + sep) || !mime[extname(target)]) { res.writeHead(404, headers).end(); return; }
      if (!(await stat(target)).isFile()) { res.writeHead(404, headers).end(); return; }
      const content = await readFile(target);
      res.writeHead(200, {...headers, 'Content-Type':mime[extname(target)]});
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404, headers).end(); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const root = process.argv.includes('--built') ? fileURLToPath(new URL('../dist/', import.meta.url)) : undefined;
  const server = createStaticServer(root);
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Koko synthetic demo: http://127.0.0.1:${port}\n`));
}
