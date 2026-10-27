import { spawnSync } from 'node:child_process';
for (const file of ['public/app.mjs','public/booking.mjs','scripts/serve.mjs','scripts/build.mjs','scripts/check.mjs']) {
  const result = spawnSync(process.execPath, ['--check',file], { stdio:'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
process.stdout.write('JavaScript syntax checks passed.\n');
