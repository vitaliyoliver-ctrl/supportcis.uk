#!/usr/bin/env node
// Импорт JSON-дампа KV (формат kv-export.mjs: [{ key, value }]) в Postgres-таблицу
// `kv` (см. src/store.ts). Используется при переезде с Cloudflare KV на self-hosting.
//
//   1) выгрузить из текущего KV:   node kv-export.mjs <NAMESPACE_ID> kv-dump.json
//   2) залить в Postgres:          node kv-import-pg.mjs kv-dump.json "postgres://user:pass@host:5432/db"
//      (строку подключения можно не передавать — возьмётся из $DATABASE_URL)
//
// Запускать из каталога worker/ (там установлен пакет `pg`).
// Эфемерные ключи (session:/otp:/swap:) НЕ импортируются — они одноразовые и
// пересоздаются сами; перенос оставил бы протухшие сессии.

import { readFileSync, existsSync } from 'node:fs';
import { Pool } from 'pg';

const [, , file, urlArg] = process.argv;
const url = urlArg || process.env.DATABASE_URL;

if (!file || !url) {
  console.error('Usage: node kv-import-pg.mjs <dump.json> [DATABASE_URL]');
  console.error('  (DATABASE_URL можно задать переменной окружения)');
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`Файл не найден: ${file}`);
  process.exit(1);
}

const EPHEMERAL = /^(session:|otp:|swap:)/;
const entries = JSON.parse(readFileSync(file, 'utf8'));
const toImport = entries.filter((e) => e && e.key && !EPHEMERAL.test(e.key));
const skipped = entries.length - toImport.length;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS kv_expires_at_idx ON kv (expires_at) WHERE expires_at IS NOT NULL;`;

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query(SCHEMA);
  await client.query('BEGIN');
  for (const { key, value } of toImport) {
    await client.query(
      `INSERT INTO kv (key, value, expires_at) VALUES ($1, $2, NULL)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = NULL`,
      [key, String(value)],
    );
    console.error(`  ${key}`);
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('Ошибка импорта, откат:', e.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

console.error(`\nГотово. Импортировано: ${toImport.length}, пропущено эфемерных: ${skipped}`);
