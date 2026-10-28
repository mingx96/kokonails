import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createLabServer } from '../scripts/serve-lab.mjs';

test('local lab only serves its fixed read-only module allowlist with test headers', async (t) => {
  const server = createLabServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/lab/styles.css', '/lab/app.mjs', '/lab/controller.mjs',
    '/server/booking-service.mjs', '/server/fake-booking-adapter.mjs', '/server/booking-errors.mjs', '/public/booking.mjs']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  for (const path of ['/AGENTS.md', '/.git/config', '/package.json', '/server/README.md', '/api/bookings',
    '/lab/index.html', '/lab/../server/README.md', '/%2e%2e%2fAGENTS.md', '/?customerId=demo-01']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  assert.equal((await fetch(origin, { method:'POST', body:'synthetic' })).status, 405);
  const hostileHostStatus = await new Promise((done,reject) => {
    const req = request(origin,{headers:{Host:'untrusted.example'}},res => {res.resume();done(res.statusCode);});
    req.on('error',reject);req.end();
  });
  assert.equal(hostileHostStatus, 403);
  const head = await fetch(origin, {method:'HEAD'});
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('lab HTML starts fail-closed and has no named fields or submission destinations', async () => {
  const html = await readFile(new URL('../lab/index.html',import.meta.url),'utf8');
  assert.match(html, /<html lang="de"/);
  assert.match(html, /<fieldset id="lab-controls" disabled/);
  assert.match(html, /id="boot-message"/);
  assert.doesNotMatch(html, /<(?:input|select|textarea)\b[^>]*\bname=/);
  assert.doesNotMatch(html, /<button\b[^>]*type="submit"|\baction=|https?:\/\//);
});
