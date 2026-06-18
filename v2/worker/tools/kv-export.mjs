#!/usr/bin/env node
// Портативный экспорт всего KV namespace в JSON (формат `wrangler kv bulk put`).
// Аккаунт-агностично: id передаётся аргументом, ничего не зашито.
//
//   node kv-export.mjs <NAMESPACE_ID> [out.json]
//
// Нужен установленный и залогиненный wrangler (npx wrangler login).

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [, , nsId, outFile = 'kv-dump.json'] = process.argv;
if (!nsId) {
  console.error('Usage: node kv-export.mjs <NAMESPACE_ID> [out.json]');
  process.exit(1);
}

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const wrangler = (args) =>
  execFileSync(NPX, ['wrangler', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

console.error(`Listing keys in ${nsId} …`);
const keys = JSON.parse(wrangler(['kv', 'key', 'list', '--namespace-id', nsId, '--remote']))
  .map((k) => k.name);
console.error(`Found ${keys.length} keys. Reading values …`);

const out = [];
for (const key of keys) {
  const raw = wrangler(['kv', 'key', 'get', key, '--namespace-id', nsId, '--remote']);
  out.push({ key, value: raw.replace(/\r?\n$/, '') });
  console.error(`  ${key}`);
}

writeFileSync(outFile, JSON.stringify(out, null, 2));
console.error(`Wrote ${out.length} entries → ${outFile}`);
