import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel test config restricts output and applies noindex/no-store to every path', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.framework,null);
  assert.equal(config.outputDirectory,'dist');
  assert.equal(config.buildCommand,'npm run build');
  assert.equal(config.git.deploymentEnabled,false);
  assert.equal(config.headers.length,1);
  assert.equal(config.headers[0].source,'/(.*)');
  const headers = new Map(config.headers[0].headers.map(({key,value}) => [key.toLowerCase(),value]));
  assert.match(headers.get('x-robots-tag'),/noindex/);
  for (const name of ['cache-control','cdn-cache-control','vercel-cdn-cache-control']) assert.match(headers.get(name),/no-store/);
  assert.equal(config.rewrites,undefined);
  assert.equal(config.redirects,undefined);
  assert.equal(config.functions,undefined);
});

test('booking stays disabled in source HTML until the interactive app is ready', async () => {
  const html = await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/<fieldset\b[^>]*id="booking-controls"[^>]*\bdisabled/);
  assert.match(html,/<button\b[^>]*id="booking-submit"[^>]*type="button"[^>]*\bdisabled/);
  assert.match(html,/<p\b[^>]*id="form-availability"[^>]*role="status"/);
  assert.match(html,/<fieldset\b[^>]*id="team-controls"[^>]*\bdisabled/);
});
