import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStaticServer } from '../scripts/serve.mjs';

test('static preview is noindex and has no writable/admin backend', async (t) => {
  const server = createStaticServer();
  await new Promise((done) => server.listen(0,'127.0.0.1',done));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  const html = await page.text();
  assert.match(html, /lang="de"/);
  assert.match(html, /name="robots" content="noindex/);
  assert.doesNotMatch(html, /application\/ld\+json|https?:\/\//);
  assert.equal((await fetch(`${origin}/api/admin`)).status,404);
  assert.equal((await fetch(`${origin}/api/bookings`,{method:'POST',body:'synthetic'})).status,405);
  assert.equal((await fetch(`${origin}/.git/config`)).status,404);
  assert.equal((await fetch(`${origin}/%2e%2e%2fAGENTS.md`)).status,404);
  assert.match(await (await fetch(`${origin}/robots.txt`)).text(), /Disallow: \//);
});

test('browser app has no submission network client or durable storage', async () => {
  const source = await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b|document\.cookie|sendBeacon/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});
