import { mkdir, realpath, lstat, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function buildStatic(root = fileURLToPath(new URL('../',import.meta.url))) {
  const appRoot = await realpath(root);
  const output = resolve(appRoot,'dist');
  // The only recursive removal target is this build's resolved output folder.
  if (dirname(output) !== appRoot || basename(output) !== 'dist') throw new Error('Invalid output directory');
  const existing = await lstat(output).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  if (existing?.isSymbolicLink()) throw new Error('Refusing symbolic output directory');
  if (existing && await realpath(output) !== output) throw new Error('Output resolves outside its intended directory');
  const assets = [];
  for (const name of ['index.html','styles.css','app.mjs','booking.mjs','favicon.svg','robots.txt']) {
    const source = join(appRoot,'public',name);
    if (!(await lstat(source)).isFile()) throw new Error(`Expected regular public asset: ${name}`);
    assets.push([name,await readFile(source)]);
  }
  await rm(output,{recursive:true,force:true});
  await mkdir(output);
  for (const [name,content] of assets) await writeFile(join(output,name),content);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildStatic();
  process.stdout.write('Clean synthetic demo built to dist/: six approved assets, no deployment.\n');
}
