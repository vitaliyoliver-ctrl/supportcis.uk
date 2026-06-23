// Node-входная точка. Тот же Hono-API (src/index.ts), запущенный на
// @hono/node-server, с Postgres вместо Cloudflare KV. Один процесс отдаёт и
// собранный фронт (app/dist) как статику с SPA-фолбэком, и /api/*.

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import app, { type Env } from './index';
import { PgStore } from './store';

const PORT = Number(process.env.PORT ?? 8787);
// Папка с собранным фронтом, относительно cwd. В Docker — ./public, локально — ../app/dist.
const STATIC_DIR = process.env.STATIC_DIR ?? '../app/dist';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[fatal] не задана переменная окружения ${name}`);
    process.exit(1);
  }
  return v;
}

const dbUrl = requireEnv('DATABASE_URL');
// SSL включаем для управляемого Postgres: по sslmode=require в строке подключения
// или явным DATABASE_SSL=1. Для локального Postgres SSL не нужен.
const dbSsl = /sslmode=require|ssl=true/i.test(dbUrl) || process.env.DATABASE_SSL === '1';
const store = await PgStore.create(dbUrl, { ssl: dbSsl });

// Окружение приложения: то, что на Cloudflare приходило через биндинги воркера.
const appEnv: Env = {
  AUTH_KV: store,
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  RESEND_FROM: process.env.RESEND_FROM ?? '',
  TG_BOT_TOKEN: process.env.TG_BOT_TOKEN ?? '',
  TG_WEBHOOK_SECRET: process.env.TG_WEBHOOK_SECRET ?? '',
  SUPABASE_URL: process.env.SUPABASE_URL ?? '',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? '',
  SITE: process.env.SITE ?? `http://localhost:${PORT}`,
  TG_CHAT_ID: process.env.TG_CHAT_ID ?? '',
  OWNER_EMAIL: process.env.OWNER_EMAIL,
  ALLOWED_DOMAINS: process.env.ALLOWED_DOMAINS,
};

// Статика + фолбэк на index.html (клиентский роутинг SPA).
const staticDir = resolve(process.cwd(), STATIC_DIR);
const indexHtml = readFileSync(join(staticDir, 'index.html'), 'utf-8');
const staticApp = new Hono();
staticApp.use('/*', serveStatic({ root: STATIC_DIR }));
staticApp.get('/*', (c) => c.html(indexHtml));

// /api/* -> Hono-API с инжектированным окружением; остальное -> статика SPA.
const fetchHandler = (request: Request): Response | Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith('/api/')) return app.fetch(request, appEnv);
  return staticApp.fetch(request);
};

const server = serve({ fetch: fetchHandler, port: PORT }, (info) => {
  console.log(`SupportCIS на http://localhost:${info.port}  (статика: ${staticDir})`);
});

// KV сам протухал ключи; здесь чистим их периодически.
const sweep = setInterval(() => {
  store.sweepExpired().catch((e) => console.error('sweepExpired', e));
}, 10 * 60 * 1000);

async function shutdown() {
  clearInterval(sweep);
  server.close();
  await store.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
