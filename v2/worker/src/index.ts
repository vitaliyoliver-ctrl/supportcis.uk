import { Hono } from 'hono';
import type { Store } from './store';

// ── Типы окружения ────────────────────────────────────────────────────────────

export type Env = {
  AUTH_KV: Store;                 // хранилище ключ→JSON (Postgres/иное), см. store.ts
  RESEND_API_KEY: string;
  RESEND_FROM: string;            // напр. "SupportCIS <noreply@plevantis.net>"
  TG_BOT_TOKEN: string;
  TG_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SITE: string;
  TG_CHAT_ID: string;
  OWNER_EMAIL?: string;           // кто получает роль TL по умолчанию (bootstrap)
  ALLOWED_DOMAINS?: string;       // разрешённые домены входа через запятую
  HELPDESK_ACCOUNT_ID?: string;   // account_id из Developers Console HelpDesk (логин Basic-auth)
  HELPDESK_PAT?: string;          // Personal Access Token HelpDesk (пароль Basic-auth)
};

type Session = { email: string; role: string };

// ── Константы ─────────────────────────────────────────────────────────────────

const SESSION_TTL = 60 * 60 * 24 * 7; // сессия — 7 дней
const OTP_TTL = 60 * 10;              // код живёт 10 минут
const OTP_RESEND_COOLDOWN = 50;      // не чаще раза в 50 сек
const OTP_MAX_ATTEMPTS = 5;          // попыток ввода на один код
const DEFAULT_ALLOWED_DOMAINS = ['velvix.org', 'gameup.club'];
const DEFAULT_OWNER = 'vitaliy.oliver@velvix.org';

type RoleLists = { tl: string[]; supervisor: string[]; ops: string[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function allowedDomains(env: Env): string[] {
  const raw = (env.ALLOWED_DOMAINS || '').trim();
  if (!raw) return DEFAULT_ALLOWED_DOMAINS;
  return raw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
}

function isAllowedEmail(env: Env, email: string): boolean {
  return allowedDomains(env).some(d => email.endsWith('@' + d));
}

function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getRoleLists(env: Env): Promise<RoleLists> {
  const raw = await env.AUTH_KV.get('roles');
  if (raw) {
    const r = JSON.parse(raw) as Partial<RoleLists>;
    return { tl: r.tl ?? [], supervisor: r.supervisor ?? [], ops: r.ops ?? [] };
  }
  // bootstrap: владелец получает TL, чтобы было кому раздавать роли
  const owner = (env.OWNER_EMAIL || DEFAULT_OWNER).toLowerCase();
  const init: RoleLists = { tl: [owner], supervisor: [], ops: [] };
  await env.AUTH_KV.put('roles', JSON.stringify(init));
  return init;
}

function roleForEmail(lists: RoleLists, email: string): string {
  const e = email.toLowerCase();
  if (lists.tl.includes(e)) return 'tl';
  if (lists.ops.includes(e)) return 'ops';
  if (lists.supervisor.includes(e)) return 'supervisor';
  return 'operator';
}

async function getSession(c: { req: { raw: Request }; env: Env }): Promise<Session | null> {
  const cookie = c.req.raw.headers.get('Cookie') || '';
  const match = cookie.match(/auth_token=([a-f0-9]{64})/);
  if (!match) return null;
  const raw = await c.env.AUTH_KV.get(`session:${match[1]}`);
  if (!raw) return null;
  return JSON.parse(raw) as Session;
}

async function sendOtpEmail(env: Env, email: string, code: string): Promise<boolean> {
  // Dev-режим: если Resend не настроен, печатаем код входа в консоль сервера —
  // чтобы логиниться локально без почтовой инфраструктуры. В проде RESEND_API_KEY
  // задан, поэтому ветка не срабатывает.
  if (!env.RESEND_API_KEY) {
    console.log(`\n[DEV] Код входа для ${email}: ${code}\n`);
    return true;
  }
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
          <p style="color:#9ca3b0;font-size:14px;line-height:1.6;margin:0 0 24px">Ваш одноразовый код. Действует 10 минут.</p>
          <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#4f8ef7;text-align:center;padding:20px;background:#111318;border-radius:12px">${code}</div>
          <p style="color:#6b7280;font-size:12px;margin:24px 0 0">Если вы не запрашивали код — проигнорируйте это письмо.</p>
        </div>`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.log('Resend error', res.status, body);
  }
  return res.ok;
}

// Cookie сессии. Secure добавляем только когда сайт на https (за TLS-прокси в
// проде). Локально по http://localhost браузер отверг бы Secure-cookie.
function sessionCookie(env: Env, value: string, maxAge: number): string {
  const secure = (env.SITE || '').startsWith('https://') ? ' Secure;' : '';
  return `auth_token=${value}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAge}`;
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// CORS: фронт (Pages) и API (Worker route /api/*) на одном домене SITE.
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', c.env.SITE);
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
  if (!email || !isAllowedEmail(c.env, email)) {
    return c.json({ ok: false, error: 'Введите корректный корпоративный адрес' }, 400);
  }

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
  if (!sent) return c.json({ ok: false, error: 'Не удалось отправить письмо' }, 502);
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
  if (!email || !code) return c.json({ ok: false, error: 'Введите код' }, 400);

  const raw = await c.env.AUTH_KV.get(`otp:${email}`);
  if (!raw) return c.json({ ok: false, error: 'Код истёк, запросите новый' }, 400);

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

  await c.env.AUTH_KV.delete(`otp:${email}`);
  const lists = await getRoleLists(c.env);
  const role = roleForEmail(lists, email);
  const token = randomToken();
  await c.env.AUTH_KV.put(`session:${token}`, JSON.stringify({ email, role }), { expirationTtl: SESSION_TTL });

  c.header('Set-Cookie', sessionCookie(c.env, token, SESSION_TTL));
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
  c.header('Set-Cookie', sessionCookie(c.env, '', 0));
  return c.json({ ok: true });
});

// ── Roles (списки по ролям) ────────────────────────────────────────────────

app.get('/api/roles', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'tl') return c.json({ ok: false, error: 'Доступ только для TL' }, 403);
  const lists = await getRoleLists(c.env);
  return c.json({ ok: true, lists });
});

app.post('/api/roles', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'tl') return c.json({ ok: false, error: 'Доступ только для TL' }, 403);

  const body = await c.req.json<Partial<RoleLists>>();
  const clean = (arr?: string[]) =>
    [...new Set((arr ?? []).map(e => e.trim().toLowerCase()))];
  const incoming: RoleLists = {
    tl: clean(body.tl),
    supervisor: clean(body.supervisor),
    ops: clean(body.ops),
  };

  // Отклоняем адреса не из разрешённых доменов
  const rejected: string[] = [];
  (['tl', 'supervisor', 'ops'] as const).forEach(k => {
    incoming[k] = incoming[k].filter(e => {
      if (isAllowedEmail(c.env, e)) return true;
      rejected.push(e);
      return false;
    });
  });

  // Нельзя удалить самого себя из TL (чтобы не потерять доступ к управлению)
  if (!incoming.tl.includes(session.email.toLowerCase())) {
    incoming.tl.push(session.email.toLowerCase());
  }

  await c.env.AUTH_KV.put('roles', JSON.stringify(incoming));
  return c.json({ ok: true, lists: incoming, rejected });
});

// ── Profiles ─────────────────────────────────────────────────────────────────

type Profile = { name?: string; position?: string; telegram?: string; since?: string };

async function getProfiles(env: Env): Promise<Record<string, Profile>> {
  const raw = await env.AUTH_KV.get('profiles');
  return raw ? JSON.parse(raw) : {};
}

app.get('/api/profiles', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  return c.json({ ok: true, profiles: await getProfiles(c.env) });
});

app.get('/api/profile', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  const email = (c.req.query('email') || session.email).toLowerCase();
  const profiles = await getProfiles(c.env);
  return c.json({ ok: true, profile: profiles[email] || null });
});

app.post('/api/profile', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);

  const body = await c.req.json<Profile & { email?: string }>();
  const email = (body.email || session.email).toLowerCase();
  // Свой профиль может править любой; чужой — только TL
  if (email !== session.email.toLowerCase() && session.role !== 'tl') {
    return c.json({ ok: false, error: 'Можно редактировать только свой профиль' }, 403);
  }
  const tg = (body.telegram || '').trim().replace(/^@+/, '');
  if (tg && !/^[a-zA-Z0-9_]{3,32}$/.test(tg)) {
    return c.json({ ok: false, error: 'Некорректный телеграм-тег' }, 400);
  }
  const profile: Profile = {
    name: (body.name || '').trim(),
    position: (body.position || '').trim(),
    telegram: tg,
    since: (body.since || '').trim(),
  };

  const profiles = await getProfiles(c.env);
  profiles[email] = profile;
  await c.env.AUTH_KV.put('profiles', JSON.stringify(profiles));
  return c.json({ ok: true, profile });
});

app.delete('/api/profile', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'tl') return c.json({ ok: false, error: 'Доступ только для TL' }, 403);
  const email = (c.req.query('email') || '').toLowerCase();
  if (!email) return c.json({ ok: false, error: 'email обязателен' }, 400);
  const profiles = await getProfiles(c.env);
  delete profiles[email];
  await c.env.AUTH_KV.put('profiles', JSON.stringify(profiles));
  return c.json({ ok: true });
});

// ── Schedule (KV-блоб по месяцу+проекту, как в v1) ──────────────────────────

type ScheduleBlob = {
  overrides: Record<string, unknown>;
  settings: Record<string, unknown>;
  version: number;
  log: Array<Record<string, unknown>>;
};

function emptyBlob(): ScheduleBlob {
  return { overrides: {}, settings: {}, version: 0, log: [] };
}

function scheduleKey(project: string, month: string): string {
  return `schedule:${project}:${month}`;
}

// Структурные настройки (паттерны, порядок операторов, позиции, увольнения,
// переопределения сотрудников) хранятся ГЛОБАЛЬНО на проект, а не по месяцам —
// чтобы правки переносились на все месяцы. overrides/log остаются помесячно.
function settingsKey(project: string): string {
  return `schedule-settings:${project}`;
}

// Чтение глобальных настроек. При первом обращении (ключа ещё нет) выполняем
// одноразовую миграцию: берём настройки из самого свежего месяца, где они есть.
async function getGlobalSettings(env: Env, project: string): Promise<Record<string, unknown>> {
  const gKey = settingsKey(project);
  const raw = await env.AUTH_KV.get(gKey);
  if (raw) {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }

  const prefix = `schedule:${project}:`;
  const entries = await env.AUTH_KV.list(prefix);
  let bestMonth = '';
  let bestSettings: Record<string, unknown> = {};
  for (const { key, value } of entries) {
    const m = key.slice(prefix.length);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) continue;
    try {
      const blob = JSON.parse(value) as ScheduleBlob;
      if (blob.settings && Object.keys(blob.settings).length && m > bestMonth) {
        bestMonth = m;
        bestSettings = blob.settings;
      }
    } catch { /* пропускаем битый блоб */ }
  }
  await env.AUTH_KV.put(gKey, JSON.stringify(bestSettings));
  return bestSettings;
}

app.get('/api/schedule', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);

  const month = c.req.query('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return c.json({ ok: false, error: 'Invalid month' }, 400);
  }
  const project = c.req.query('project') || 'sg';
  const raw = await c.env.AUTH_KV.get(scheduleKey(project, month));
  const blob = raw ? (JSON.parse(raw) as ScheduleBlob) : emptyBlob();
  // Настройки — глобальные на проект, не из месячного блоба.
  const settings = await getGlobalSettings(c.env, project);
  return c.json({ ok: true, ...blob, settings });
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
  const project = c.req.query('project') || 'sg';

  const body = await c.req.json<{
    overrides?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    version?: number;
    logEntries?: Array<{ action: string; target?: string | null }>;
  }>();

  const key = scheduleKey(project, month);
  const raw = await c.env.AUTH_KV.get(key);
  const prev = raw ? (JSON.parse(raw) as ScheduleBlob) : emptyBlob();

  // Оптимистичная блокировка: версия клиента должна совпасть с серверной
  if (typeof body.version === 'number' && body.version !== prev.version) {
    return c.json({ ok: false, error: 'stale', version: prev.version }, 409);
  }

  const now = new Date().toISOString();
  const newLog = [
    ...(body.logEntries ?? []).map(e => ({ at: now, by: session.email, action: e.action, target: e.target ?? null })),
    ...prev.log,
  ].slice(0, 200);

  // Структурные настройки сохраняем глобально (если пришли в запросе), а в
  // месячный блоб их больше не пишем.
  if (body.settings !== undefined) {
    await c.env.AUTH_KV.put(settingsKey(project), JSON.stringify(body.settings));
  }

  const next: ScheduleBlob = {
    overrides: body.overrides ?? prev.overrides,
    settings: prev.settings,  // legacy-поле блоба не трогаем; настройки читаются глобально
    version: prev.version + 1,
    log: newLog,
  };
  await c.env.AUTH_KV.put(key, JSON.stringify(next));
  return c.json({ ok: true, version: next.version, log: next.log });
});

// ── Swap helpers ───────────────────────────────────────────────────────────

const SWAP_EXTRA_TYPE: Record<string, string> = {
  morning: 'extra_morning', evening: 'extra_evening', shift1200: 'extra_1200',
  vip_morning: 'extra_vip_morning', vip_evening: 'extra_vip_evening', vip_1200: 'extra_vip_1200',
  super_day: 'extra_sup_day', super_night: 'extra_sup_night', super_day8: 'extra_sup_day8',
};
const SWAP_TTL = 60 * 60 * 24 * 60;

async function tgApi(env: Env, method: string, payload: unknown) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const json = await r.json() as Record<string, unknown>;
    if (!json.ok) console.error(`tgApi ${method} failed:`, JSON.stringify(json));
    return json;
  } catch (e) { console.error(`tgApi ${method} exception:`, e); return { ok: false }; }
}

function escTg(s: unknown) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function lunchText(rec: Record<string, unknown>) {
  return rec.withLunch ? 'передаётся получателю' : 'остаётся у отдающего';
}

function swapTgText(rec: Record<string, unknown>) {
  let t = `🔄 <b>Заявка на обмен смены</b>\n\n`;
  t += `Отдаёт: <b>${escTg(rec.giver)}</b>\n`;
  t += `Получает: <b>${escTg(rec.recipient)}</b>\n`;
  t += `Дата: <b>${escTg(rec.date)}</b>\n`;
  t += `Смена: ${escTg(rec.shiftLabel)}\n`;
  t += `Часы: <b>${escTg(rec.range)}</b> · ${rec.hours}ч\n`;
  t += `Обед: <b>${lunchText(rec)}</b>\n`;
  if (rec.comment) t += `Комментарий: ${escTg(rec.comment)}\n`;
  t += `\nОт: ${escTg(rec.giverEmail)}`;
  return t;
}

async function sendSwapEmail(env: Env, to: string, subject: string, lines: string[]) {
  if (!to || !env.RESEND_API_KEY) return false;
  const body = lines.map(l => `<p style="color:#9ca3af;font-size:14px;margin:0 0 10px">${l}</p>`).join('');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM || 'SupportCIS <noreply@supportcis.uk>',
        to,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:440px;margin:0 auto;padding:32px;background:#0a0c10;border-radius:16px;border:1px solid #1f2937;">
            <div style="text-align:center;margin-bottom:24px;">
              <span style="font-size:24px;font-weight:700;color:#fff;">Support<span style="color:#4f8ef7;">CIS</span></span>
            </div>
            ${body}
            <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:24px;">Это автоматическое письмо, отвечать на него не нужно.</p>
          </div>
        `,
      }),
    });
    if (!res.ok) console.error('sendSwapEmail failed:', res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error('sendSwapEmail exception:', e);
    return false;
  }
}

async function applySwapToSchedule(env: Env, rec: Record<string, unknown>, approver: string) {
  const key = scheduleKey(String(rec.project || 'sg'), String(rec.month));
  const raw = await env.AUTH_KV.get(key);
  const blob: ScheduleBlob = raw ? JSON.parse(raw) : emptyBlob();
  const overrides = { ...blob.overrides };
  const nowIso = new Date().toISOString();

  const ov = overrides as Record<string, any>;

  const gKey = `${rec.giver}:${rec.date}`;
  const g: any = ov[gKey] ? { ...ov[gKey] } : {};
  if (!g.type) g.type = rec.shiftType;
  g.extraEvents = [...(g.extraEvents ?? []),
    { type: 'loss_swap_give', hours: rec.hours, range: rec.range, swapWith: rec.recipient, win: rec.win, withLunch: rec.withLunch }];
  const gNote = `Отдал смену → ${rec.recipient} (${rec.range}, ${rec.hours}ч)`;
  g.note = g.note ? `${g.note}; ${gNote}` : gNote;
  g.editedBy = `swap-bot (${approver})`; g.editedAt = nowIso;
  ov[gKey] = g;

  const rKey = `${rec.recipient}:${rec.date}`;
  const r: any = ov[rKey] ? { ...ov[rKey] } : {};
  const hasWorkType = r.type && r.type !== 'off' && r.type !== 'birthday';
  if (!hasWorkType) r.type = SWAP_EXTRA_TYPE[rec.shiftType as string];
  r.extraEvents = [...(r.extraEvents ?? []),
    { type: 'extra_swap_take', hours: rec.hours, range: rec.range, swapWith: rec.giver, win: rec.win, withLunch: rec.withLunch }];
  const rNote = `Получил смену ← ${rec.giver} (${rec.range}, ${rec.hours}ч)`;
  r.note = r.note ? `${r.note}; ${rNote}` : rNote;
  r.editedBy = `swap-bot (${approver})`; r.editedAt = nowIso;
  ov[rKey] = r;

  const newLog = [...(blob.log ?? []), {
    at: nowIso, by: `tg:${approver}`,
    action: `свап (бот): ${rec.giver} → ${rec.recipient} · ${rec.date} · ${rec.range} (${rec.hours}ч)`,
    target: String(rec.recipient),
  }].slice(-200);

  await env.AUTH_KV.put(key, JSON.stringify({ ...blob, overrides: ov, version: Date.now(), log: newLog }));
}

// ── Swap request ────────────────────────────────────────────────────────────

app.post('/api/swap-request', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);

  const body = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();
  const rec: Record<string, unknown> = {
    id, status: 'pending', createdAt: new Date().toISOString(),
    giverEmail: session.email,
    project: body.project || 'sg',
    month: body.month, date: body.date,
    giver: body.giver, recipient: body.recipient, recipientEmail: body.recipientEmail,
    shiftType: body.shiftType, shiftLabel: body.shiftLabel ?? body.shiftType,
    range: body.range, hours: body.hours, comment: body.comment ?? '',
    win: body.win, withLunch: body.withLunch === true,
  };

  const tgRes = await tgApi(c.env, 'sendMessage', {
    chat_id: c.env.TG_CHAT_ID,
    text: swapTgText(rec),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[
      { text: '✅ Апрув', callback_data: `sw:a:${id}` },
      { text: '❌ Отказ', callback_data: `sw:d:${id}` },
    ]] },
  });

  if (!tgRes.ok) return c.json({ ok: false, error: 'Не удалось отправить заявку в Telegram' }, 502);

  rec.tgMessageId = (tgRes.result as Record<string, unknown>)?.message_id ?? null;
  await c.env.AUTH_KV.put(`swap:${id}`, JSON.stringify(rec), { expirationTtl: SWAP_TTL });
  return c.json({ ok: true, id });
});

// ── Telegram webhook (approve / deny) ──────────────────────────────────────

app.post('/api/tg-webhook', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (!c.env.TG_WEBHOOK_SECRET || secret !== c.env.TG_WEBHOOK_SECRET) {
    console.error(`tg-webhook: SECRET MISMATCH. got=${secret ? `"${secret}"` : 'none'} expected_set=${c.env.TG_WEBHOOK_SECRET ? 'yes' : 'NO'}`);
    return c.text('forbidden', 403);
  }

  let update: Record<string, unknown>;
  try { update = await c.req.json(); } catch { return c.json({ ok: true }); }

  const cb = update?.callback_query as Record<string, unknown> | undefined;
  console.log('tg-webhook: cb.data=', cb?.data ?? 'no callback_query');
  if (!cb?.data) return c.json({ ok: true });

  const m = String(cb.data).match(/^sw:(a|d):(.{36})$/);
  console.log('tg-webhook: regex match=', m ? `yes action=${m[1]} id=${m[2]}` : 'NO MATCH');
  if (!m) { await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id }); return c.json({ ok: true }); }

  const action = m[1];
  const id = m[2];
  const from = cb.from as Record<string, unknown>;
  const approver = from?.username ? `@${from.username}` : String(from?.first_name ?? 'неизвестно');
  const cbMsg = cb.message as Record<string, unknown>;

  console.log(`tg-webhook: action=${action} id=${id} approver=${approver}`);
  const raw = await c.env.AUTH_KV.get(`swap:${id}`);
  console.log(`tg-webhook: raw from KV=`, raw ? 'found' : 'NOT FOUND');
  if (!raw) {
    await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Заявка не найдена или истекла' });
    return c.json({ ok: true });
  }
  const rec = JSON.parse(raw) as Record<string, unknown>;
  console.log(`tg-webhook: rec.status=${rec.status}`);

  if (rec.status !== 'pending') {
    await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Уже: ${rec.status === 'approved' ? 'апрув' : 'отказ'}` });
    return c.json({ ok: true });
  }

  if (action === 'd') {
    rec.status = 'denied'; rec.decidedBy = approver; rec.decidedAt = new Date().toISOString();
    await c.env.AUTH_KV.put(`swap:${id}`, JSON.stringify(rec), { expirationTtl: SWAP_TTL });
    await sendSwapEmail(c.env, String(rec.giverEmail), 'Заявка на обмен смены отклонена', [
      `Ваша заявка на передачу смены отклонена.`,
      `<b style="color:#fff">Дата:</b> ${escTg(rec.date)}`,
      `<b style="color:#fff">Смена:</b> ${escTg(rec.shiftLabel)}, ${escTg(rec.range)} (${rec.hours}ч)`,
      `<b style="color:#fff">Обед:</b> ${lunchText(rec)}`,
      `<b style="color:#fff">Получатель:</b> ${escTg(rec.recipient)}`,
      `<b style="color:#fff">Решение принял:</b> ${escTg(rec.decidedBy)}`,
    ]);
    await tgApi(c.env, 'editMessageText', {
      chat_id: (cbMsg?.chat as Record<string,unknown>)?.id ?? c.env.TG_CHAT_ID,
      message_id: cbMsg?.message_id ?? rec.tgMessageId,
      text: swapTgText(rec) + `\n\n❌ <b>Отказано</b> · ${escTg(approver)}`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    });
    await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Отказано' });
    return c.json({ ok: true });
  }

  try { await applySwapToSchedule(c.env, rec, approver); } catch (e) {
    console.error('applySwapToSchedule error:', e);
    await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Ошибка применения к графику!' });
    return c.json({ ok: true });
  }

  rec.status = 'approved'; rec.decidedBy = approver; rec.decidedAt = new Date().toISOString();
  await c.env.AUTH_KV.put(`swap:${id}`, JSON.stringify(rec), { expirationTtl: SWAP_TTL });
  await sendSwapEmail(c.env, String(rec.giverEmail), 'Заявка на обмен смены одобрена', [
    `Ваша заявка на передачу смены одобрена и применена к графику.`,
    `<b style="color:#fff">Дата:</b> ${escTg(rec.date)}`,
    `<b style="color:#fff">Смена:</b> ${escTg(rec.shiftLabel)}, ${escTg(rec.range)} (${rec.hours}ч)`,
    `<b style="color:#fff">Обед:</b> ${lunchText(rec)}`,
    `<b style="color:#fff">Получатель:</b> ${escTg(rec.recipient)}`,
    `<b style="color:#fff">Решение принял:</b> ${escTg(rec.decidedBy)}`,
  ]);
  await sendSwapEmail(c.env, String(rec.recipientEmail), 'Вам передана смена', [
    `${escTg(rec.giver)} передал(а) вам часы смены, обмен одобрен и применён к графику.`,
    `<b style="color:#fff">Дата:</b> ${escTg(rec.date)}`,
    `<b style="color:#fff">Смена:</b> ${escTg(rec.shiftLabel)}, ${escTg(rec.range)} (${rec.hours}ч)`,
    `<b style="color:#fff">Обед:</b> ${lunchText(rec)}`,
    `<b style="color:#fff">Решение принял:</b> ${escTg(rec.decidedBy)}`,
  ]);
  await tgApi(c.env, 'editMessageText', {
    chat_id: (cbMsg?.chat as Record<string,unknown>)?.id ?? c.env.TG_CHAT_ID,
    message_id: cbMsg?.message_id ?? rec.tgMessageId,
    text: swapTgText(rec) + `\n\n✅ <b>Апрув</b> · ${escTg(approver)} · применено к графику`,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [] },
  });
  await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Апрув, график обновлён' });
  return c.json({ ok: true });
});

// ── Swap/Telegram diagnose (TL only) ────────────────────────────────────────
// Диагностика бота свапов без доступа к серверу: показывает, заданы ли переменные
// (без раскрытия значений), пингует getMe/getWebhookInfo, по флагам регистрирует
// вебхук и шлёт тестовое сообщение в чат.
//   GET /api/tg-diagnose            — только проверка (getMe + getWebhookInfo)
//   GET /api/tg-diagnose?fix=1      — + setWebhook на $SITE/api/tg-webhook
//   GET /api/tg-diagnose?test=1     — + тестовый sendMessage в TG_CHAT_ID
app.get('/api/tg-diagnose', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'tl') return c.json({ ok: false, error: 'Доступ только для TL' }, 403);

  const env = c.env;
  const result: Record<string, unknown> = {
    env: {
      TG_BOT_TOKEN: env.TG_BOT_TOKEN ? `set (…${env.TG_BOT_TOKEN.slice(-4)})` : 'MISSING',
      TG_WEBHOOK_SECRET: env.TG_WEBHOOK_SECRET ? 'set' : 'MISSING',
      TG_CHAT_ID: env.TG_CHAT_ID || 'MISSING',
      SITE: env.SITE || 'MISSING',
    },
  };

  if (!env.TG_BOT_TOKEN) return c.json({ ok: false, ...result, hint: 'TG_BOT_TOKEN не задан в .env сервера' }, 200);

  result.getMe = await tgApi(env, 'getMe', {});

  if (c.req.query('test')) {
    result.sendMessage = env.TG_CHAT_ID
      ? await tgApi(env, 'sendMessage', { chat_id: env.TG_CHAT_ID, text: '✅ Проверка бота свапов: связь с чатом работает.' })
      : { ok: false, description: 'TG_CHAT_ID не задан' };
  }

  if (c.req.query('fix')) {
    if (!env.TG_WEBHOOK_SECRET) {
      result.setWebhook = { ok: false, description: 'TG_WEBHOOK_SECRET не задан' };
    } else {
      const hookUrl = `${(env.SITE || '').replace(/\/$/, '')}/api/tg-webhook`;
      result.setWebhook = await tgApi(env, 'setWebhook', { url: hookUrl, secret_token: env.TG_WEBHOOK_SECRET, allowed_updates: ['callback_query'] });
      result.hookUrl = hookUrl;
    }
  }

  result.getWebhookInfo = await tgApi(env, 'getWebhookInfo', {});
  return c.json({ ok: true, ...result });
});

// ── Sales ──────────────────────────────────────────────────────────────────

type SalesMonthData = { rows: unknown[]; dateFrom: string | null; dateTo: string | null };

app.get('/api/sales/data', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  const raw = await c.env.AUTH_KV.get('sales');
  const data: Record<string, SalesMonthData> = raw ? JSON.parse(raw) : {};
  return c.json({ ok: true, data });
});

app.post('/api/sales/upload', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'tl' && session.role !== 'ops') {
    return c.json({ ok: false, error: 'Нет доступа' }, 403);
  }
  const body = await c.req.json<{ month?: string; rows?: unknown[]; dateFrom?: string | null; dateTo?: string | null }>();
  if (!body.month) return c.json({ ok: false, error: 'month обязателен' }, 400);

  const raw = await c.env.AUTH_KV.get('sales');
  const data: Record<string, SalesMonthData> = raw ? JSON.parse(raw) : {};
  data[body.month] = {
    rows: body.rows ?? [],
    dateFrom: body.dateFrom ?? null,
    dateTo: body.dateTo ?? null,
  };
  await c.env.AUTH_KV.put('sales', JSON.stringify(data));
  return c.json({ ok: true });
});

// ── Ops structure (оргструктура — единый JSON-блоб) ─────────────────────────
// Заменяет отдельный воркер ops-structure-api: тот же контракт (GET → массив,
// POST → сохранить массив), но в составе единого воркера и в своём KV.

app.get('/api/ops/structure', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  const raw = await c.env.AUTH_KV.get('ops-structure');
  // Контракт страницы: ожидается массив отделов напрямую.
  return c.json(raw ? JSON.parse(raw) : []);
});

app.post('/api/ops/structure', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'tl' && session.role !== 'ops') {
    return c.json({ ok: false, error: 'Нет доступа' }, 403);
  }
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'Invalid JSON' }, 400); }
  if (!Array.isArray(body)) return c.json({ ok: false, error: 'Ожидается массив' }, 400);
  await c.env.AUTH_KV.put('ops-structure', JSON.stringify(body));
  return c.json({ ok: true });
});

// ── HelpDesk (тикеты с маскировкой почт) ─────────────────────────────────────
// Свой ограниченный интерфейс к тикет-системе HelpDesk (api.helpdesk.com).
// Смысл: операторы работают через портал и НЕ имеют учётки/токена самого
// HelpDesk. Worker ходит в HelpDesk единым серверным токеном, а перед отдачей
// фронту вычищает из ответа адреса почт. Так недобросовестный оператор не может
// собрать базу контактов — почты до его браузера просто не доходят.
//
// ВАЖНО про точные пути/параметры: ниже зафиксированы базовый URL и эндпоинты
// HelpDesk API v1. Конкретные имена query-параметров поиска и форма тела ответа
// зависят от тарифа/версии аккаунта — при необходимости правятся в одном месте
// (HELPDESK_BASE и хелперы ниже). Маскировка же schema-agnostic: рекурсивно
// обходит ЛЮБОЙ JSON-ответ, поэтому работает независимо от точной формы данных.

const HELPDESK_BASE = 'https://api.helpdesk.com/v1';

// Адрес почты в произвольном тексте (тело письма, цитаты, подписи).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Поля, которые целиком являются контактом и должны стать псевдонимом, даже
// если значение почему-то не похоже на email регуляркой.
const EMAIL_KEYS = new Set([
  'email', 'from', 'to', 'cc', 'bcc', 'mail', 'address', 'replyto', 'sender',
  'recipient', 'requester', 'requesteremail', 'authoremail', 'contactemail',
  'customeremail', 'useremail', 'fromemail', 'toemail',
]);

// Стабильный псевдоним: один и тот же адрес → один и тот же ярлык (чтобы оператор
// видел, что несколько тикетов от одного человека), но восстановить адрес нельзя.
function pseudonym(email: string): string {
  let h = 5381;
  const s = email.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h + s.charCodeAt(i)) >>> 0);
  return `client#${h.toString(36)}`;
}

// Рекурсивный обход JSON: и строковые значения (почты внутри текста), и
// поля-контакты заменяются на псевдонимы. lastIndex у глобальной регулярки
// сбрасывается самим .replace, состояние между вызовами не течёт.
function maskDeep(node: unknown, keyHint = ''): unknown {
  if (typeof node === 'string') {
    const k = keyHint.toLowerCase().replace(/[^a-z]/g, '');
    if (EMAIL_KEYS.has(k) && node.includes('@')) return pseudonym(node);
    return node.replace(EMAIL_RE, m => pseudonym(m));
  }
  if (Array.isArray(node)) return node.map(v => maskDeep(v, keyHint));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = maskDeep(v, k);
    return out;
  }
  return node;
}

function helpdeskAuth(env: Env): string {
  return 'Basic ' + btoa(`${env.HELPDESK_ACCOUNT_ID}:${env.HELPDESK_PAT}`);
}

async function helpdeskFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${HELPDESK_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': helpdeskAuth(env),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

// Простой лимит на оператора, чтобы нельзя было выкачать всю базу скриптом.
const HD_RL_MAX = 120;     // запросов в окно
const HD_RL_WINDOW = 60;   // секунд

async function hdRateLimit(env: Env, email: string): Promise<boolean> {
  const win = Math.floor(Date.now() / 1000 / HD_RL_WINDOW);
  const key = `hd-rl:${email}:${win}`;
  const cur = parseInt((await env.AUTH_KV.get(key)) || '0', 10);
  if (cur >= HD_RL_MAX) return false;
  await env.AUTH_KV.put(key, String(cur + 1), { expirationTtl: HD_RL_WINDOW * 2 });
  return true;
}

// Аудит: кто что искал/открывал/отправлял. Хранится 90 дней. Доступен TL —
// так массовое выкачивание видно постфактум.
async function hdAudit(env: Env, email: string, action: string, detail: string): Promise<void> {
  const at = new Date().toISOString();
  const id = crypto.randomUUID().slice(0, 8);
  await env.AUTH_KV.put(
    `hd-audit:${at}:${id}`,
    JSON.stringify({ at, by: email, action, detail }),
    { expirationTtl: 60 * 60 * 24 * 90 },
  );
}

function helpdeskConfigured(env: Env): boolean {
  return Boolean(env.HELPDESK_ACCOUNT_ID && env.HELPDESK_PAT);
}

// Список/поиск тикетов. Проброс безопасного набора query-параметров; ответ
// маскируется целиком.
app.get('/api/helpdesk/tickets', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  if (!(await hdRateLimit(c.env, session.email))) return c.json({ ok: false, error: 'Слишком много запросов, подождите' }, 429);

  const params = new URLSearchParams();
  for (const k of ['query', 'cursor', 'status', 'sortBy', 'order', 'pageSize',
    'createdDateFrom', 'createdDateTo', 'lastMessageFrom', 'lastMessageTo']) {
    const v = c.req.query(k);
    if (v) params.set(k, v);
  }
  // teamIDs[] может прийти несколько раз (мультивыбор групп) — пробрасываем все.
  for (const tid of c.req.queries('teamIDs[]') || []) {
    if (tid) params.append('teamIDs[]', tid);
  }
  await hdAudit(c.env, session.email, 'list', params.get('query') || '(все)');

  const res = await helpdeskFetch(c.env, `/tickets${params.toString() ? '?' + params : ''}`);
  if (!res.ok) return c.json({ ok: false, error: `HelpDesk ${res.status}` }, 502);
  const data = await res.json().catch(() => null);
  return c.json({ ok: true, data: maskDeep(data) });
});

// Создание тикета. Тело прокидываем как есть (subject/message/requester/teamIDs),
// ответ маскируем. Форма тела — по HelpDesk API; при расхождении правится здесь.
app.post('/api/helpdesk/tickets', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  if (!(await hdRateLimit(c.env, session.email))) return c.json({ ok: false, error: 'Слишком много запросов, подождите' }, 429);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'Некорректный запрос' }, 400); }
  await hdAudit(c.env, session.email, 'create', (body as { subject?: string })?.subject || '(новый)');

  const res = await helpdeskFetch(c.env, '/tickets', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('helpdesk create failed', res.status, detail);
    return c.json({ ok: false, error: `HelpDesk ${res.status}: ${detail.slice(0, 300)}` }, 502);
  }
  const data = await res.json().catch(() => null);
  return c.json({ ok: true, data: maskDeep(data) });
});


// Список команд (групп) — для фильтра. Возвращаем только ID и имя.
app.get('/api/helpdesk/teams', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  const res = await helpdeskFetch(c.env, '/teams');
  if (!res.ok) return c.json({ ok: false, error: `HelpDesk ${res.status}` }, 502);
  const j = await res.json().catch(() => null);
  const arr = Array.isArray(j) ? j : (j as { teams?: unknown[] } | null)?.teams;
  const teams = Array.isArray(arr)
    ? arr.map((t) => ({ ID: (t as { ID?: string }).ID, name: (t as { name?: string }).name })).filter(t => t.ID && t.name)
    : [];
  return c.json({ ok: true, teams });
});

// Список тегов аккаунта (ID + имя) — для отображения и добавления.
app.get('/api/helpdesk/tags', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  const res = await helpdeskFetch(c.env, '/tags');
  if (!res.ok) return c.json({ ok: false, error: `HelpDesk ${res.status}` }, 502);
  const j = await res.json().catch(() => null);
  const arr = Array.isArray(j) ? j : (j as { tags?: unknown[] } | null)?.tags;
  const tags = Array.isArray(arr)
    ? arr.map((t) => ({ ID: (t as { ID?: string }).ID, name: (t as { name?: string }).name })).filter(t => t.ID && t.name)
    : [];
  return c.json({ ok: true, tags });
});

// Добавить теги тикету. Тело: { tagIDs: [...] }.
app.post('/api/helpdesk/tickets/:id/tags', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  const id = c.req.param('id');
  let tagIDs: string[] = [];
  try { const b = await c.req.json<{ tagIDs?: string[] }>(); tagIDs = Array.isArray(b.tagIDs) ? b.tagIDs : []; } catch { return c.json({ ok: false, error: 'Некорректный запрос' }, 400); }
  if (!tagIDs.length) return c.json({ ok: false, error: 'Нет тегов' }, 400);
  await hdAudit(c.env, session.email, 'tag', id);
  const res = await helpdeskFetch(c.env, `/tickets/${encodeURIComponent(id)}/tags`, { method: 'POST', body: JSON.stringify({ tagIDs }) });
  if (!res.ok) return c.json({ ok: false, error: `HelpDesk ${res.status}` }, 502);
  return c.json({ ok: true });
});

// Снять тег с тикета.
app.delete('/api/helpdesk/tickets/:id/tags/:tagId', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  const id = c.req.param('id'), tagId = c.req.param('tagId');
  const res = await helpdeskFetch(c.env, `/tickets/${encodeURIComponent(id)}/tags/${encodeURIComponent(tagId)}`, { method: 'DELETE' });
  if (!res.ok) return c.json({ ok: false, error: `HelpDesk ${res.status}` }, 502);
  return c.json({ ok: true });
});

// Персональные сохранённые фильтры — по email пользователя.
app.get('/api/helpdesk/saved-filters', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  const raw = await c.env.AUTH_KV.get(`hd-filters:${session.email.toLowerCase()}`);
  return c.json({ ok: true, filters: raw ? JSON.parse(raw) : [] });
});

app.post('/api/helpdesk/saved-filters', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'Некорректный запрос' }, 400); }
  if (!Array.isArray(body)) return c.json({ ok: false, error: 'Ожидается массив' }, 400);
  await c.env.AUTH_KV.put(`hd-filters:${session.email.toLowerCase()}`, JSON.stringify(body.slice(0, 50)));
  return c.json({ ok: true });
});

// Один тикет с перепиской. Маскируется целиком, включая тела сообщений.
app.get('/api/helpdesk/tickets/:id', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  if (!(await hdRateLimit(c.env, session.email))) return c.json({ ok: false, error: 'Слишком много запросов, подождите' }, 429);

  const id = c.req.param('id');
  await hdAudit(c.env, session.email, 'view', id);
  const res = await helpdeskFetch(c.env, `/tickets/${encodeURIComponent(id)}`);
  if (!res.ok) return c.json({ ok: false, error: `HelpDesk ${res.status}` }, 502);
  const data = await res.json().catch(() => null);
  return c.json({ ok: true, data: maskDeep(data) });
});

// Сменить группу (команду) тикета. PATCH assignment.team + teamIDs.
app.post('/api/helpdesk/tickets/:id/assign', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  const id = c.req.param('id');
  let teamID = '';
  try { const b = await c.req.json<{ teamID?: string }>(); teamID = (b.teamID || '').trim(); } catch { return c.json({ ok: false, error: 'Некорректный запрос' }, 400); }
  if (!teamID) return c.json({ ok: false, error: 'Не указана группа' }, 400);
  await hdAudit(c.env, session.email, 'assign', `${id} → ${teamID}`);
  // Назначение только на команду (без агента) задаётся через teamIDs:
  // assignment.team в записи требует обязательного peer agent.
  const res = await helpdeskFetch(c.env, `/tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ teamIDs: [teamID] }),
  });
  if (!res.ok) { const d = await res.text().catch(() => ''); return c.json({ ok: false, error: `HelpDesk ${res.status}: ${d.slice(0, 200)}` }, 502); }
  return c.json({ ok: true });
});

// Тикеты этого же клиента: берём реальную почту тикета (она на сервере) и ищем
// по ней полнотекстово — так находятся все обращения клиента, даже не из выдачи.
app.get('/api/helpdesk/tickets/:id/related', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  if (!(await hdRateLimit(c.env, session.email))) return c.json({ ok: false, error: 'Слишком много запросов, подождите' }, 429);
  const id = c.req.param('id');
  const tRes = await helpdeskFetch(c.env, `/tickets/${encodeURIComponent(id)}`);
  if (!tRes.ok) return c.json({ ok: false, error: `HelpDesk ${tRes.status}` }, 502);
  const ticket = await tRes.json().catch(() => null) as { requester?: { email?: string } } | null;
  const email = ticket?.requester?.email;
  if (!email) return c.json({ ok: true, data: [] });
  const params = new URLSearchParams({ query: email, pageSize: '100' });
  const res = await helpdeskFetch(c.env, `/tickets?${params}`);
  if (!res.ok) return c.json({ ok: false, error: `HelpDesk ${res.status}` }, 502);
  const data = await res.json().catch(() => null);
  return c.json({ ok: true, data: maskDeep(data) });
});

// Ответ оператора. Получателя НЕ принимаем от клиента — пишем строго по ticket_id,
// адрес знать не нужно. HelpDesk сам доставит письмо адресату тикета.
app.post('/api/helpdesk/tickets/:id/reply', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (!helpdeskConfigured(c.env)) return c.json({ ok: false, error: 'HelpDesk не настроен' }, 503);
  if (!(await hdRateLimit(c.env, session.email))) return c.json({ ok: false, error: 'Слишком много запросов, подождите' }, 429);

  const id = c.req.param('id');
  let text = '';
  let isPrivate = false;
  try {
    const body = await c.req.json<{ text?: string; isPrivate?: boolean }>();
    text = (body.text || '').trim();
    isPrivate = body.isPrivate === true;
  } catch {
    return c.json({ ok: false, error: 'Некорректный запрос' }, 400);
  }
  if (!text) return c.json({ ok: false, error: 'Пустой ответ' }, 400);

  await hdAudit(c.env, session.email, isPrivate ? 'note' : 'reply', id);

  // По документации HelpDesk сообщение/заметка добавляются через PATCH тикета:
  // author.type=agent, message.text, isPrivate (верхний уровень). true — заметка.
  const res = await helpdeskFetch(c.env, `/tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ author: { type: 'agent' }, message: { text }, isPrivate }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('helpdesk reply failed', res.status, detail);
    return c.json({ ok: false, error: `HelpDesk ${res.status}` }, 502);
  }
  const data = await res.json().catch(() => null);
  return c.json({ ok: true, data: maskDeep(data) });
});

// Журнал действий в HelpDesk — только TL.
app.get('/api/helpdesk/audit', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);
  if (session.role !== 'tl') return c.json({ ok: false, error: 'Доступ только для TL' }, 403);
  const entries = await c.env.AUTH_KV.list('hd-audit:');
  const log = entries
    .map(e => { try { return JSON.parse(e.value); } catch { return null; } })
    .filter(Boolean)
    .sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 500);
  return c.json({ ok: true, log });
});

// ── Health (liveness для Docker/реверс-прокси) ──────────────────────────────────

app.get('/api/health', (c) => c.json({ ok: true }));

// ── 404 ───────────────────────────────────────────────────────────────────────

app.all('*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
