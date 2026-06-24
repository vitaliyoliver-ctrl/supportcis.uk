#!/usr/bin/env node
/**
 * Миграция данных с supportcis.uk (Cloudflare worker) → plevantis.net (v2/Postgres)
 * через публичные API обоих сайтов (OTP-логин).
 *
 * Использование:
 *   node api-migrate.mjs [--export-only] [--import-only dump.json]
 *
 *   По умолчанию: экспорт + импорт за один прогон.
 *   --export-only   : только выгрузить в api-dump.json (без импорта)
 *   --import-only F : только залить из файла F (без экспорта)
 */

import readline from 'node:readline';
import { writeFileSync, readFileSync } from 'node:fs';

const OLD = 'https://supportcis.uk';
const NEW = 'https://plevantis.net';

const PROJECTS = ['sg', 'nk'];

// Диапазон месяцев: 2 месяца назад .. 8 месяцев вперёд
function monthRange() {
  const months = [];
  const now = new Date();
  for (let i = -2; i <= 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

// ── readline helpers ────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function apiPost(base, path, body, cookie = '') {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { res, data: await res.json(), cookie: res.headers.get('set-cookie') || '' };
}

async function apiGet(base, path, cookie) {
  const res = await fetch(`${base}${path}`, {
    headers: { Cookie: cookie },
  });
  if (!res.ok) return null;
  return res.json();
}

// ── OTP auth ────────────────────────────────────────────────────────────────

async function login(base, siteName) {
  console.log(`\n── Вход на ${siteName} (${base}) ──`);
  const email = await ask('Email: ');

  // Определяем эндпоинты (старый сайт vs v2)
  const sendPath = base === OLD ? '/api/send-code' : '/api/auth/request-code';
  const verifyPath = base === OLD ? '/api/verify-code' : '/api/auth/verify-code';

  const { data: sendData } = await apiPost(base, sendPath, { email });
  if (!sendData.ok) {
    console.error('Ошибка отправки кода:', sendData.error || sendData);
    process.exit(1);
  }
  console.log('Код отправлен на почту.');

  const code = await ask('Введите код: ');
  const { data: verData, cookie } = await apiPost(base, verifyPath, { email, code });
  if (!verData.ok) {
    console.error('Ошибка верификации:', verData.error || verData);
    process.exit(1);
  }

  // Вытащить cookie auth_token
  const match = cookie.match(/auth_token=[a-f0-9]{64}/);
  if (!match) {
    console.error('Не удалось получить auth_token из Set-Cookie:', cookie);
    process.exit(1);
  }
  const authCookie = match[0];
  console.log('Авторизован ✓');
  return authCookie;
}

// ── Экспорт ─────────────────────────────────────────────────────────────────

async function doExport(cookie) {
  const months = monthRange();
  const dump = { schedule: {}, profiles: {} };

  console.log(`\nЭкспорт расписания (проекты: ${PROJECTS.join(', ')}, месяцы: ${months[0]}..${months[months.length - 1]}) …`);

  for (const project of PROJECTS) {
    for (const month of months) {
      const data = await apiGet(OLD, `/api/schedule?month=${month}&project=${project}`, cookie);
      if (!data || !data.ok) {
        process.stderr.write(`  ${project}/${month}: нет данных\n`);
        continue;
      }
      const hasData = Object.keys(data.overrides || {}).length > 0 ||
                      Object.keys(data.settings || {}).length > 0;
      if (hasData) {
        const key = `${project}:${month}`;
        dump.schedule[key] = {
          overrides: data.overrides || {},
          settings: data.settings || {},
          log: data.log || [],
        };
        console.log(`  ✓ schedule ${project}/${month} (overrides: ${Object.keys(data.overrides || {}).length})`);
      } else {
        process.stderr.write(`  ${project}/${month}: пустой\n`);
      }
    }
  }

  // Профили (только TL видит все)
  console.log('\nЭкспорт профилей …');
  const profData = await apiGet(OLD, '/api/profiles', cookie);
  if (profData?.ok && profData.profiles) {
    dump.profiles = profData.profiles;
    console.log(`  ✓ профилей: ${Object.keys(profData.profiles).length}`);
  } else {
    console.log('  Профили недоступны (нужна роль TL) — пропускаем.');
  }

  return dump;
}

// ── Импорт ──────────────────────────────────────────────────────────────────

async function doImport(cookie, dump) {
  const scheduleEntries = Object.entries(dump.schedule || {});
  console.log(`\nИмпорт расписания (${scheduleEntries.length} записей) …`);

  for (const [key, blob] of scheduleEntries) {
    const [project, month] = key.split(':');
    // Не передаём version → v2 пропускает проверку конфликтов
    const { data } = await apiPost(
      NEW,
      `/api/schedule?month=${month}&project=${project}`,
      { overrides: blob.overrides, settings: blob.settings, logEntries: [] },
      cookie,
    );
    if (data.ok) {
      console.log(`  ✓ ${project}/${month} (новая версия: ${data.version})`);
    } else {
      console.error(`  ✗ ${project}/${month}: ${data.error || JSON.stringify(data)}`);
    }
  }

  // Профили
  const profiles = Object.values(dump.profiles || {});
  if (profiles.length > 0) {
    console.log(`\nИмпорт профилей (${profiles.length}) …`);
    for (const p of profiles) {
      if (!p.email) continue;
      const { data } = await apiPost(NEW, '/api/profile', p, cookie);
      if (data.ok) {
        console.log(`  ✓ ${p.email}`);
      } else {
        console.error(`  ✗ ${p.email}: ${data.error || JSON.stringify(data)}`);
      }
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const exportOnly = args.includes('--export-only');
const importOnlyIdx = args.indexOf('--import-only');
const importOnly = importOnlyIdx !== -1;
const dumpFile = importOnly ? args[importOnlyIdx + 1] : 'api-dump.json';

if (!dumpFile && importOnly) {
  console.error('--import-only требует имя файла: --import-only dump.json');
  process.exit(1);
}

let dump;

if (!importOnly) {
  const oldCookie = await login(OLD, 'старый сайт (supportcis.uk)');
  dump = await doExport(oldCookie);
  writeFileSync(dumpFile, JSON.stringify(dump, null, 2));
  console.log(`\nДамп сохранён → ${dumpFile} (schedule: ${Object.keys(dump.schedule).length}, profiles: ${Object.keys(dump.profiles).length})`);
}

if (!exportOnly) {
  if (importOnly) {
    dump = JSON.parse(readFileSync(dumpFile, 'utf8'));
    console.log(`Загружен дамп ${dumpFile}: schedule: ${Object.keys(dump.schedule).length}, profiles: ${Object.keys(dump.profiles).length}`);
  }
  const newCookie = await login(NEW, 'новый сайт (plevantis.net)');
  await doImport(newCookie, dump);
  console.log('\nМиграция завершена ✓');
}

rl.close();
