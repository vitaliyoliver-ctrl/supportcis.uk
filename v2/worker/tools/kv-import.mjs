#!/usr/bin/env node
// Портативный импорт JSON-дампа (формат kv-export.mjs) в KV namespace.
// Аккаунт-агностично: id передаётся аргументом.
//
//   node kv-import.mjs <NAMESPACE_ID> <dump.json>
//
// Нужен установленный и залогиненный wrangler (npx wrangler login).

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const [, , nsId, file] = process.argv;
if (!nsId || !file) {
  console.error('Usage: node kv-import.mjs <NAMESPACE_ID> <dump.json>');
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';
console.error(`Importing ${file} → namespace ${nsId} …`);
execFileSync(NPX, ['wrangler', 'kv', 'bulk', 'put', file, '--namespace-id', nsId, '--remote'], {
  stdio: 'inherit',
});
console.error('Done.');
