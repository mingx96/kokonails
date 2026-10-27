import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { buildStatic } from '../scripts/build.mjs';
import { createStaticServer } from '../scripts/serve.mjs';

const expected = ['app.mjs','booking.mjs','favicon.svg','index.html','robots.txt','styles.css'];
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),'koko-build-'));
  assert.equal(dirname(resolve(root)),resolve(tmpdir()));
  t.after(() => rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'public'));
  for (const name of expected) await writeFile(join(root,'public',name),`synthetic fixture ${name}`);
  return root;
}

test('clean build removes stale output and exposes exactly six approved assets', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root,'dist','old'),{recursive:true});
  await writeFile(join(root,'dist','old','stale-sentinel.txt'),'synthetic stale output');
  await writeFile(join(root,'public','unapproved.txt'),'synthetic unapproved asset');
  await writeFile(join(root,'keep-wip.txt'),'synthetic outside-output sentinel');
  await buildStatic(root);
  assert.deepEqual((await readdir(join(root,'dist'))).sort(),expected);
  for (const name of expected) assert.equal(await readFile(join(root,'dist',name),'utf8'),`synthetic fixture ${name}`);
  assert.equal(await readFile(join(root,'keep-wip.txt'),'utf8'),'synthetic outside-output sentinel');
  assert.equal(await readFile(join(root,'public','unapproved.txt'),'utf8'),'synthetic unapproved asset');
});

test('build refuses an output junction instead of deleting another directory', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root,'other-work'));
  await writeFile(join(root,'other-work','sentinel.txt'),'synthetic keep');
  await symlink(join(root,'other-work'),join(root,'dist'),process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(buildStatic(root),/output.*symbolic|symbolic.*output/i);
  assert.equal(await readFile(join(root,'other-work','sentinel.txt'),'utf8'),'synthetic keep');
});

test('built artifact exposes only approved files and configured test headers', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root,'private-sentinel.txt'),'synthetic outside-output data');
  await buildStatic(root);
  const server = createStaticServer(join(root,'dist'));
  await new Promise((done) => server.listen(0,'127.0.0.1',done));
  t.after(() => new Promise((done) => server.close(done)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/',...expected.map((name) => `/${name}`)]) {
    for (const method of ['GET','HEAD']) {
      const response = await fetch(origin + path,{method});
      assert.equal(response.status,200);
      assert.match(response.headers.get('x-robots-tag'),/noindex/);
      for (const name of ['cache-control','cdn-cache-control','vercel-cdn-cache-control']) assert.equal(response.headers.get(name),'no-store');
    }
  }
  for (const path of ['/private-sentinel.txt','/docs/review-images/desktop.png','/vercel.json','/.git/config','/api/admin','/old/stale-sentinel.txt']) {
    const response = await fetch(origin + path);
    assert.equal(response.status,404);
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal((await fetch(origin,{method:'POST',body:'synthetic'})).status,405);
});
