import { cp, mkdir } from 'node:fs/promises';
await mkdir(new URL('../dist/', import.meta.url), { recursive:true });
for (const name of ['index.html','styles.css','app.mjs','booking.mjs','favicon.svg','robots.txt']) {
  await cp(new URL(`../public/${name}`, import.meta.url), new URL(`../dist/${name}`, import.meta.url));
}
process.stdout.write('Static synthetic demo built to dist/ (no deployment).\n');
