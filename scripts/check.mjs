import { spawnSync } from 'node:child_process';
for (const file of ['public/app.mjs','public/booking.mjs','scripts/serve.mjs','scripts/serve-lab.mjs','scripts/build.mjs','scripts/check.mjs','tests/browser-boot.cjs','tests/browser-flow.cjs','tests/lab-browser.cjs','tests/lab-usability.cjs','server/booking-service.mjs','server/fake-booking-adapter.mjs','server/booking-errors.mjs','lab/app.mjs','lab/controller.mjs']) {
  const result = spawnSync(process.execPath, ['--check',file], { stdio:'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
process.stdout.write('JavaScript syntax checks passed.\n');
