// Run research-area.mjs for every area in public/data/areas.json, one at a time.
// Extra flags pass through:  npm run research:all -- --auto
// A failed area is reported and skipped; the exit code is non-zero if any failed.

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const areas = JSON.parse(await readFile(new URL('public/data/areas.json', root), 'utf8'));
const script = fileURLToPath(new URL('scripts/research-area.mjs', root));
const failed = [];
for (const [n, a] of areas.entries()) {
  console.log(`\n=== ${n + 1}/${areas.length} ${a.name} ===`);
  const r = spawnSync(process.execPath, [script, a.id, ...process.argv.slice(2)], { stdio:'inherit' });
  if (r.status !== 0) failed.push(a.id);
}
console.log(failed.length ? `\nFailed: ${failed.join(', ')}` : `\nAll ${areas.length} areas done`);
process.exit(failed.length ? 1 : 0);
