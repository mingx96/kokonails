import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// This serves source assets only. Booking operations execute in browser memory.
// No request body, API, authentication or database is implemented here.
const routes = new Map([
  ['/', ['lab/index.html','text/html; charset=utf-8']],
  ['/lab/styles.css', ['lab/styles.css','text/css; charset=utf-8']],
  ['/lab/app.mjs', ['lab/app.mjs','text/javascript; charset=utf-8']],
  ['/lab/controller.mjs', ['lab/controller.mjs','text/javascript; charset=utf-8']],
  ['/server/booking-service.mjs', ['server/booking-service.mjs','text/javascript; charset=utf-8']],
  ['/server/fake-booking-adapter.mjs', ['server/fake-booking-adapter.mjs','text/javascript; charset=utf-8']],
  ['/server/booking-errors.mjs', ['server/booking-errors.mjs','text/javascript; charset=utf-8']],
  ['/public/booking.mjs', ['public/booking.mjs','text/javascript; charset=utf-8']],
  ['/favicon.svg', ['public/favicon.svg','image/svg+xml']],
  ['/robots.txt', ['public/robots.txt','text/plain; charset=utf-8']],
]);
const headers = Object.freeze({
  'Cache-Control':'no-store', 'CDN-Cache-Control':'no-store', 'Vercel-CDN-Cache-Control':'no-store',
  'X-Robots-Tag':'noindex, nofollow, noarchive', 'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
});

export function createLabServer() {
  return createServer(async (req,res) => {
    if (req.headers.host !== `127.0.0.1:${req.socket.localPort}`) { res.writeHead(403,headers).end(); return; }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{...headers,Allow:'GET, HEAD'}).end(); return; }
    const route = routes.get(req.url);
    if (!route) { res.writeHead(404,headers).end(); return; }
    try {
      const body = await readFile(new URL('../'+route[0],import.meta.url));
      res.writeHead(200,{...headers,'Content-Type':route[1]});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404,headers).end(); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.KOKO_LAB_PORT || 4183);
  createLabServer().listen(port,'127.0.0.1',() => process.stdout.write(`Koko local synthetic lab: http://127.0.0.1:${port}\n`));
}
