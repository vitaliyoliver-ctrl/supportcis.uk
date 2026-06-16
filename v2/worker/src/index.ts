import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Типы окружения ────────────────────────────────────────────────────────────

type Env = {
  AUTH_KV: KVNamespace;
  RESEND_API_KEY: string;
  TG_BOT_TOKEN: string;
  TG_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SITE: string;
  TG_CHAT_ID: string;
};

type Vars = { session: { email: string; role: string } | null };

// ── Константы ─────────────────────────────────────────────────────────────────

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 дней

// ── Helpers ───────────────────────────────────────────────────────────────────

function supabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
}

async function getSession(c: { req: { raw: Request }; env: Env }) {
  const cookie = c.req.raw.headers.get('Cookie') || '';
  const match = cookie.match(/auth_token=([a-f0-9]{64})/);
  if (!match) return null;
  const raw = await c.env.AUTH_KV.get(`session:${match[1]}`);
  if (!raw) return null;
  return JSON.parse(raw) as { email: string; role: string };
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('*', async (c, next) => {
  const origin = c.env.SITE;
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Vary', 'Origin');
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');
    return c.body(null, 204);
  }
  await next();
});

// ── Auth ─────────────────────────────────────────────────────────────────────

app.post('/api/auth/send-code', async (c) => {
  // Проксируем на существующий auth-worker (на время переходного периода)
  // TODO: перенести логику сюда после миграции инфры
  const body = await c.req.text();
  const res = await fetch('https://auth-api.vitaliy-barkhanskiy.workers.dev/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return c.json(await res.json(), res.status as 200);
});

app.post('/api/auth/verify-code', async (c) => {
  const body = await c.req.text();
  const res = await fetch('https://auth-api.vitaliy-barkhanskiy.workers.dev/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.json() as Record<string, unknown>;
  if (res.ok && data.ok) {
    const setCookie = res.headers.get('Set-Cookie') || '';
    const tokenMatch = setCookie.match(/auth_token=([a-f0-9]{64})/);
    if (tokenMatch) {
      const cookie = `auth_token=${tokenMatch[1]}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`;
      c.header('Set-Cookie', cookie);
    }
  }
  return c.json(data, res.status as 200);
});

app.get('/api/auth/check', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  return c.json({ ok: true, email: session.email, role: session.role });
});

app.post('/api/auth/logout', async (c) => {
  const cookie = c.req.raw.headers.get('Cookie') || '';
  const match = cookie.match(/auth_token=([a-f0-9]{64})/);
  if (match) await c.env.AUTH_KV.delete(`session:${match[1]}`);
  c.header('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return c.json({ ok: true });
});

// ── Schedule: employees ───────────────────────────────────────────────────────

app.get('/api/schedule/employees', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);

  const db = supabase(c.env);
  const { data: sections } = await db
    .from('sections')
    .select('*, employees(*)')
    .order('sort_order');

  return c.json({ ok: true, sections });
});

// ── Schedule: overrides + patterns ────────────────────────────────────────────

app.get('/api/schedule', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);

  const month = c.req.query('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return c.json({ ok: false, error: 'Invalid month' }, 400);
  }

  const db = supabase(c.env);
  const monthStart = `${month}-01`;
  const [year, mo] = month.split('-').map(Number);
  const monthEnd = new Date(year, mo, 0).toISOString().slice(0, 10);

  const [{ data: overrides }, { data: patterns }, { data: log }] = await Promise.all([
    db.from('schedule_overrides')
      .select('*')
      .gte('date', monthStart)
      .lte('date', monthEnd),
    db.from('shift_patterns').select('*'),
    db.from('schedule_log')
      .select('*')
      .eq('month', month)
      .order('at', { ascending: false })
      .limit(200),
  ]);

  return c.json({ ok: true, overrides, patterns, log });
});

app.post('/api/schedule', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'tl' && session.role !== 'supervisor') {
    return c.json({ ok: false, error: 'Нет доступа' }, 403);
  }

  const month = c.req.query('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return c.json({ ok: false, error: 'Invalid month' }, 400);
  }

  const body = await c.req.json<{
    overrides?: Array<{
      employee_id: string; date: string; shift_key: string;
      extra_events?: unknown[]; custom_hours?: number | null; note?: string;
    }>;
    logEntries?: Array<{ action: string; target?: string }>;
  }>();

  const db = supabase(c.env);

  if (body.overrides?.length) {
    const rows = body.overrides.map(o => ({
      ...o,
      edited_by: session.email,
      edited_at: new Date().toISOString(),
    }));
    const { error } = await db.from('schedule_overrides').upsert(rows, {
      onConflict: 'employee_id,date',
    });
    if (error) return c.json({ ok: false, error: error.message }, 500);
  }

  if (body.logEntries?.length) {
    await db.from('schedule_log').insert(
      body.logEntries.map(e => ({
        by: session.email,
        action: String(e.action),
        target_name: e.target ?? null,
        month,
      }))
    );
  }

  return c.json({ ok: true });
});

// ── 404 ───────────────────────────────────────────────────────────────────────

app.all('*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
