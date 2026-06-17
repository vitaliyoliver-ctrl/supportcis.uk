import { Hono } from 'hono';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Типы окружения ────────────────────────────────────────────────────────────

type Env = {
  AUTH_KV: KVNamespace;
  RESEND_API_KEY: string;
  RESEND_FROM: string;            // напр. "SupportCIS <noreply@plevantis.net>"
  TG_BOT_TOKEN: string;
  TG_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SITE: string;
  TG_CHAT_ID: string;
};

type Vars = { session: { email: string; role: string } | null };

// ── Константы ─────────────────────────────────────────────────────────────────

const SESSION_TTL = 60 * 60 * 24 * 7; // сессия — 7 дней
const OTP_TTL = 60 * 10;              // код живёт 10 минут
const OTP_RESEND_COOLDOWN = 50;      // не чаще раза в 50 сек (фронт показывает 60)
const OTP_MAX_ATTEMPTS = 5;          // попыток ввода на один код
const ALLOWED_DOMAINS = ['velvix.org', 'gameup.club'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function supabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
}

function isAllowedEmail(email: string): boolean {
  return ALLOWED_DOMAINS.some(d => email.endsWith('@' + d));
}

function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Роль пользователя: хранится в KV `role:<email>` (управляется через /api/roles).
// По умолчанию — обычный оператор.
async function resolveRole(env: Env, email: string): Promise<string> {
  const r = await env.AUTH_KV.get(`role:${email}`);
  return r || 'operator';
}

async function getSession(c: { req: { raw: Request }; env: Env }) {
  const cookie = c.req.raw.headers.get('Cookie') || '';
  const match = cookie.match(/auth_token=([a-f0-9]{64})/);
  if (!match) return null;
  const raw = await c.env.AUTH_KV.get(`session:${match[1]}`);
  if (!raw) return null;
  return JSON.parse(raw) as { email: string; role: string };
}

async function sendOtpEmail(env: Env, email: string, code: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: `${code} — код входа в SupportCIS`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0a0c10;color:#e8eaf0;border-radius:16px">
          <h2 style="color:#fff;margin:0 0 8px">Вход в портал SupportCIS</h2>
          <p style="color:#9ca3b0;font-size:14px;line-height:1.6;margin:0 0 24px">
            Ваш одноразовый код для входа. Действует 10 минут.
          </p>
          <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#4f8ef7;text-align:center;padding:20px;background:#111318;border-radius:12px">
            ${code}
          </div>
          <p style="color:#6b7280;font-size:12px;margin:24px 0 0">
            Если вы не запрашивали код — просто проигнорируйте это письмо.
          </p>
        </div>`,
    }),
  });
  return res.ok;
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// CORS: фронт и API на одном домене (Pages + Worker route /api/*), поэтому
// Origin совпадает с SITE. Заголовки нужны на случай предзапросов.
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

app.post('/api/send-code', async (c) => {
  let email = '';
  try {
    const body = await c.req.json<{ email?: string }>();
    email = (body.email || '').trim().toLowerCase();
  } catch {
    return c.json({ ok: false, error: 'Некорректный запрос' }, 400);
  }

  if (!email || !isAllowedEmail(email)) {
    return c.json({ ok: false, error: 'Введите корректный корпоративный адрес' }, 400);
  }

  // Анти-спам: не отправляем код чаще, чем раз в OTP_RESEND_COOLDOWN секунд.
  const existing = await c.env.AUTH_KV.get(`otp:${email}`);
  if (existing) {
    const data = JSON.parse(existing) as { sentAt: number };
    if (Date.now() - data.sentAt < OTP_RESEND_COOLDOWN * 1000) {
      return c.json({ ok: false, error: 'Код уже отправлен, подождите немного' }, 429);
    }
  }

  const code = randomCode();
  await c.env.AUTH_KV.put(
    `otp:${email}`,
    JSON.stringify({ code, sentAt: Date.now(), attempts: 0 }),
    { expirationTtl: OTP_TTL }
  );

  const sent = await sendOtpEmail(c.env, email, code);
  if (!sent) {
    return c.json({ ok: false, error: 'Не удалось отправить письмо' }, 502);
  }

  return c.json({ ok: true });
});

app.post('/api/verify-code', async (c) => {
  let email = '', code = '';
  try {
    const body = await c.req.json<{ email?: string; code?: string }>();
    email = (body.email || '').trim().toLowerCase();
    code = (body.code || '').trim();
  } catch {
    return c.json({ ok: false, error: 'Некорректный запрос' }, 400);
  }

  if (!email || !code) {
    return c.json({ ok: false, error: 'Введите код' }, 400);
  }

  const raw = await c.env.AUTH_KV.get(`otp:${email}`);
  if (!raw) {
    return c.json({ ok: false, error: 'Код истёк, запросите новый' }, 400);
  }

  const data = JSON.parse(raw) as { code: string; sentAt: number; attempts: number };

  if (data.attempts >= OTP_MAX_ATTEMPTS) {
    await c.env.AUTH_KV.delete(`otp:${email}`);
    return c.json({ ok: false, error: 'Слишком много попыток, запросите новый код' }, 429);
  }

  if (data.code !== code) {
    await c.env.AUTH_KV.put(
      `otp:${email}`,
      JSON.stringify({ ...data, attempts: data.attempts + 1 }),
      { expirationTtl: OTP_TTL }
    );
    return c.json({ ok: false, error: 'Неверный код' }, 400);
  }

  // Успех — удаляем код, создаём сессию.
  await c.env.AUTH_KV.delete(`otp:${email}`);
  const role = await resolveRole(c.env, email);
  const token = randomToken();
  await c.env.AUTH_KV.put(
    `session:${token}`,
    JSON.stringify({ email, role }),
    { expirationTtl: SESSION_TTL }
  );

  c.header(
    'Set-Cookie',
    `auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`
  );
  return c.json({ ok: true, email, role });
});

app.get('/api/check', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  return c.json({ ok: true, email: session.email, role: session.role });
});

app.post('/api/logout', async (c) => {
  const cookie = c.req.raw.headers.get('Cookie') || '';
  const match = cookie.match(/auth_token=([a-f0-9]{64})/);
  if (match) await c.env.AUTH_KV.delete(`session:${match[1]}`);
  c.header('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return c.json({ ok: true });
});

// ── Roles (управление ролями) ───────────────────────────────────────────────

app.get('/api/roles', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'admin') return c.json({ ok: false, error: 'Нет доступа' }, 403);

  const list = await c.env.AUTH_KV.list({ prefix: 'role:' });
  const roles: Record<string, string> = {};
  for (const k of list.keys) {
    const v = await c.env.AUTH_KV.get(k.name);
    if (v) roles[k.name.slice('role:'.length)] = v;
  }
  return c.json({ ok: true, roles });
});

app.post('/api/roles', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'admin') return c.json({ ok: false, error: 'Нет доступа' }, 403);

  const body = await c.req.json<{ email?: string; role?: string }>();
  const email = (body.email || '').trim().toLowerCase();
  const role = (body.role || '').trim();
  if (!email || !role) return c.json({ ok: false, error: 'email и role обязательны' }, 400);

  await c.env.AUTH_KV.put(`role:${email}`, role);
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
  if (session.role !== 'tl' && session.role !== 'supervisor' && session.role !== 'admin') {
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
