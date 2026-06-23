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
  return c.json({ ok: true, ...blob });
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

  const next: ScheduleBlob = {
    overrides: body.overrides ?? prev.overrides,
    settings: body.settings ?? prev.settings,
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

  const cbData = String(cb.data);

  // Offer: забрать через TG (so:t:{id})
  if (/^so:t:.{36}$/.test(cbData)) {
    const offerId = cbData.slice(5);
    const from = cb.from as Record<string, unknown>;
    const tgUsername = String(from?.username ?? '').toLowerCase();

    if (!tgUsername) {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'У вас не установлен username в Telegram' });
      return c.json({ ok: true });
    }

    // Найти профиль по Telegram username
    const profiles = await getProfiles(c.env);
    const takerEntry = Object.entries(profiles).find(([, p]) => (p.telegram || '').toLowerCase() === tgUsername);
    if (!takerEntry) {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Telegram @${tgUsername} не привязан ни к одному профилю на сайте` });
      return c.json({ ok: true });
    }
    const [takerEmail, takerProfile] = takerEntry;
    const takerName = takerProfile.name || takerEmail;

    const offerRaw = await c.env.AUTH_KV.get(`offer:${offerId}`);
    if (!offerRaw) {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Предложение не найдено или истекло' });
      return c.json({ ok: true });
    }
    const offer: ShiftOffer = JSON.parse(offerRaw);

    if (offer.status !== 'open') {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Предложение уже ${offer.status}` });
      return c.json({ ok: true });
    }
    if (offer.giverEmail === takerEmail) {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Нельзя забрать своё предложение' });
      return c.json({ ok: true });
    }

    offer.status = 'taken';
    offer.takerName = takerName;
    offer.takerEmail = takerEmail;
    offer.takenAt = new Date().toISOString();

    const cbMsg = cb.message as Record<string, unknown>;
    await tgApi(c.env, 'editMessageText', {
      chat_id: (cbMsg?.chat as Record<string,unknown>)?.id ?? c.env.TG_CHAT_ID,
      message_id: cbMsg?.message_id ?? offer.tgMessageId,
      text: offerTgText(offer) + `\n\n🙋 <b>Забирает:</b> ${escTg(takerName)} (@${escTg(tgUsername)}) — ожидает апрув TL`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    });

    // Отправляем запрос на апрув TL
    const approvalRes = await tgApi(c.env, 'sendMessage', {
      chat_id: c.env.TG_CHAT_ID,
      text: offerApprovalTgText(offer),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[
        { text: '✅ Апрув', callback_data: `oa:a:${offerId}` },
        { text: '❌ Отказ', callback_data: `oa:d:${offerId}` },
      ]] },
    });

    offer.tgMessageId = approvalRes.ok
      ? (approvalRes.result as Record<string, unknown>)?.message_id as number ?? null
      : null;
    await c.env.AUTH_KV.put(`offer:${offerId}`, JSON.stringify(offer), { expirationTtl: OFFER_TTL });

    await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Заявка отправлена TL на апрув' });
    return c.json({ ok: true });
  }

  // Offer: отозвать через TG (so:c:{id})
  if (/^so:c:.{36}$/.test(cbData)) {
    const offerId = cbData.slice(5);
    const from = cb.from as Record<string, unknown>;
    const tgUsername = String(from?.username ?? '').toLowerCase();

    const offerRaw = await c.env.AUTH_KV.get(`offer:${offerId}`);
    if (!offerRaw) {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Предложение не найдено' });
      return c.json({ ok: true });
    }
    const offer: ShiftOffer = JSON.parse(offerRaw);

    // Только автор может отозвать — проверяем по TG username через профили
    const profiles = await getProfiles(c.env);
    const giverProfile = profiles[offer.giverEmail];
    const giverTg = (giverProfile?.telegram || '').toLowerCase();
    const isOwner = giverTg && giverTg === tgUsername;
    // TL тоже могут отозвать (определяем по роли из сессии — здесь через список ролей)
    const roles = await c.env.AUTH_KV.get('roles');
    const roleLists: RoleLists = roles ? JSON.parse(roles) : { tl: [], supervisor: [], ops: [] };
    const isTl = roleLists.tl.some(e => {
      const p = profiles[e];
      return p?.telegram && p.telegram.toLowerCase() === tgUsername;
    });

    if (!isOwner && !isTl) {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Отозвать может только автор предложения или TL' });
      return c.json({ ok: true });
    }
    if (offer.status !== 'open') {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Нельзя отозвать — статус: ${offer.status}` });
      return c.json({ ok: true });
    }

    offer.status = 'cancelled';
    await c.env.AUTH_KV.put(`offer:${offerId}`, JSON.stringify(offer), { expirationTtl: OFFER_TTL });

    const cbMsg = cb.message as Record<string, unknown>;
    await tgApi(c.env, 'editMessageText', {
      chat_id: (cbMsg?.chat as Record<string,unknown>)?.id ?? c.env.TG_CHAT_ID,
      message_id: cbMsg?.message_id ?? offer.tgMessageId,
      text: offerTgText(offer) + `\n\n🚫 <b>Отозвано</b>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    });
    await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Предложение отозвано' });
    return c.json({ ok: true });
  }

  // Offer approval: TL апрув/отказ (oa:a:{id} / oa:d:{id})
  const oaMatch = cbData.match(/^oa:(a|d):(.{36})$/);
  if (oaMatch) {
    const oaAction = oaMatch[1];
    const offerId = oaMatch[2];
    const from = cb.from as Record<string, unknown>;
    const approver = from?.username ? `@${from.username}` : String(from?.first_name ?? 'неизвестно');
    const cbMsg = cb.message as Record<string, unknown>;

    const offerRaw = await c.env.AUTH_KV.get(`offer:${offerId}`);
    if (!offerRaw) {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Предложение не найдено или истекло' });
      return c.json({ ok: true });
    }
    const offer: ShiftOffer = JSON.parse(offerRaw);

    if (offer.status !== 'taken') {
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Уже: ${offer.status}` });
      return c.json({ ok: true });
    }

    if (oaAction === 'd') {
      offer.status = 'denied';
      await c.env.AUTH_KV.put(`offer:${offerId}`, JSON.stringify(offer), { expirationTtl: OFFER_TTL });
      await tgApi(c.env, 'editMessageText', {
        chat_id: (cbMsg?.chat as Record<string,unknown>)?.id ?? c.env.TG_CHAT_ID,
        message_id: cbMsg?.message_id ?? offer.tgMessageId,
        text: offerApprovalTgText(offer) + `\n\n❌ <b>Отказано</b> · ${escTg(approver)}`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
      });
      await sendSwapEmail(c.env, offer.giverEmail, 'Передача смены отклонена', [
        `Ваше предложение смены было отклонено TL.`,
        `<b>Дата:</b> ${escTg(offer.date)}`,
        `<b>Смена:</b> ${escTg(offer.shiftLabel)}, ${escTg(offer.range)} (${offer.hours}ч)`,
        `<b>Хотел забрать:</b> ${escTg(offer.takerName)}`,
        `<b>Решение:</b> ${escTg(approver)}`,
      ]);
      if (offer.takerEmail) {
        await sendSwapEmail(c.env, offer.takerEmail, 'Передача смены отклонена', [
          `TL отклонил передачу смены от ${escTg(offer.giver)}.`,
          `<b>Дата:</b> ${escTg(offer.date)}`,
          `<b>Смена:</b> ${escTg(offer.shiftLabel)}, ${escTg(offer.range)} (${offer.hours}ч)`,
          `<b>Решение:</b> ${escTg(approver)}`,
        ]);
      }
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Отказано' });
      return c.json({ ok: true });
    }

    // Апрув — применяем к графику
    try { await applyOfferToSchedule(c.env, offer, approver); } catch (e) {
      console.error('applyOfferToSchedule error:', e);
      await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Ошибка применения к графику!' });
      return c.json({ ok: true });
    }

    offer.status = 'approved';
    await c.env.AUTH_KV.put(`offer:${offerId}`, JSON.stringify(offer), { expirationTtl: OFFER_TTL });

    await tgApi(c.env, 'editMessageText', {
      chat_id: (cbMsg?.chat as Record<string,unknown>)?.id ?? c.env.TG_CHAT_ID,
      message_id: cbMsg?.message_id ?? offer.tgMessageId,
      text: offerApprovalTgText(offer) + `\n\n✅ <b>Апрув</b> · ${escTg(approver)} · применено к графику`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    });
    await sendSwapEmail(c.env, offer.giverEmail, 'Передача смены одобрена', [
      `Ваше предложение смены принято и применено к графику.`,
      `<b>Дата:</b> ${escTg(offer.date)}`,
      `<b>Смена:</b> ${escTg(offer.shiftLabel)}, ${escTg(offer.range)} (${offer.hours}ч)`,
      `<b>Забрал:</b> ${escTg(offer.takerName)}`,
      `<b>Решение:</b> ${escTg(approver)}`,
    ]);
    if (offer.takerEmail) {
      await sendSwapEmail(c.env, offer.takerEmail, 'Смена получена', [
        `${escTg(offer.giver)} передал(а) вам смену, обмен одобрен и применён к графику.`,
        `<b>Дата:</b> ${escTg(offer.date)}`,
        `<b>Смена:</b> ${escTg(offer.shiftLabel)}, ${escTg(offer.range)} (${offer.hours}ч)`,
        `<b>Решение:</b> ${escTg(approver)}`,
      ]);
    }
    await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Апрув, график обновлён' });
    return c.json({ ok: true });
  }

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

// ── Shift Offer (публичное предложение смены) ──────────────────────────────

const OFFER_TTL = 60 * 60 * 24 * 30; // 30 дней

type ShiftOffer = {
  id: string;
  status: 'open' | 'taken' | 'approved' | 'denied' | 'cancelled';
  project: string;
  month: string;
  date: string;
  giver: string;
  giverEmail: string;
  shiftKey: string;
  shiftLabel: string;
  range: string;
  win: [number, number];
  hours: number;
  withLunch: boolean;
  comment: string;
  tgMessageId: number | null;
  takerName: string | null;
  takerEmail: string | null;
  createdAt: string;
  takenAt: string | null;
};

function offerTgText(o: ShiftOffer) {
  let t = `📢 <b>Открытое предложение смены</b>\n\n`;
  t += `Отдаёт: <b>${escTg(o.giver)}</b>\n`;
  t += `Дата: <b>${escTg(o.date)}</b>\n`;
  t += `Смена: ${escTg(o.shiftLabel)}\n`;
  t += `Часы: <b>${escTg(o.range)}</b> · ${o.hours}ч\n`;
  t += `Обед: <b>${o.withLunch ? 'передаётся' : 'остаётся у отдающего'}</b>\n`;
  if (o.comment) t += `Комментарий: ${escTg(o.comment)}\n`;
  t += `\nНажмите кнопку ниже, чтобы забрать смену.`;
  return t;
}

function offerApprovalTgText(o: ShiftOffer) {
  let t = `🔄 <b>Заявка на передачу смены</b> (через предложение)\n\n`;
  t += `Отдаёт: <b>${escTg(o.giver)}</b>\n`;
  t += `Забирает: <b>${escTg(o.takerName)}</b>\n`;
  t += `Дата: <b>${escTg(o.date)}</b>\n`;
  t += `Смена: ${escTg(o.shiftLabel)}\n`;
  t += `Часы: <b>${escTg(o.range)}</b> · ${o.hours}ч\n`;
  t += `Обед: <b>${o.withLunch ? 'передаётся' : 'остаётся у отдающего'}</b>\n`;
  if (o.comment) t += `Комментарий: ${escTg(o.comment)}\n`;
  t += `\nОт: ${escTg(o.giverEmail)} → ${escTg(o.takerEmail)}`;
  return t;
}

async function applyOfferToSchedule(env: Env, o: ShiftOffer, approver: string) {
  const key = scheduleKey(o.project, o.month);
  const raw = await env.AUTH_KV.get(key);
  const blob: ScheduleBlob = raw ? JSON.parse(raw) : emptyBlob();
  const ov = { ...blob.overrides } as Record<string, any>;
  const nowIso = new Date().toISOString();

  const gKey = `${o.giver}:${o.date}`;
  const g: any = ov[gKey] ? { ...ov[gKey] } : {};
  if (!g.type) g.type = o.shiftKey;
  g.extraEvents = [...(g.extraEvents ?? []),
    { type: 'loss_swap_give', hours: o.hours, range: o.range, swapWith: o.takerName, win: o.win, withLunch: o.withLunch }];
  const gNote = `Отдал смену → ${o.takerName} (${o.range}, ${o.hours}ч)`;
  g.note = g.note ? `${g.note}; ${gNote}` : gNote;
  g.editedBy = `offer-bot (${approver})`; g.editedAt = nowIso;
  ov[gKey] = g;

  const rKey = `${o.takerName}:${o.date}`;
  const r: any = ov[rKey] ? { ...ov[rKey] } : {};
  const hasWorkType = r.type && r.type !== 'off' && r.type !== 'birthday';
  if (!hasWorkType) r.type = SWAP_EXTRA_TYPE[o.shiftKey] ?? o.shiftKey;
  r.extraEvents = [...(r.extraEvents ?? []),
    { type: 'extra_swap_take', hours: o.hours, range: o.range, swapWith: o.giver, win: o.win, withLunch: o.withLunch }];
  const rNote = `Получил смену ← ${o.giver} (${o.range}, ${o.hours}ч)`;
  r.note = r.note ? `${r.note}; ${rNote}` : rNote;
  r.editedBy = `offer-bot (${approver})`; r.editedAt = nowIso;
  ov[rKey] = r;

  const newLog = [...(blob.log ?? []), {
    at: nowIso, by: `tg:${approver}`,
    action: `оффер-свап (бот): ${o.giver} → ${o.takerName} · ${o.date} · ${o.range} (${o.hours}ч)`,
    target: String(o.takerName),
  }].slice(-200);

  await env.AUTH_KV.put(key, JSON.stringify({ ...blob, overrides: ov, version: Date.now(), log: newLog }));
}

// POST /api/shift-offer — создать предложение
app.post('/api/shift-offer', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);

  const body = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();

  const offer: ShiftOffer = {
    id,
    status: 'open',
    project: String(body.project || 'sg'),
    month: String(body.month || ''),
    date: String(body.date || ''),
    giver: String(body.giver || ''),
    giverEmail: session.email,
    shiftKey: String(body.shiftKey || ''),
    shiftLabel: String(body.shiftLabel || ''),
    range: String(body.range || ''),
    win: (body.win as [number, number]) || [0, 0],
    hours: Number(body.hours) || 0,
    withLunch: body.withLunch === true,
    comment: String(body.comment || '').trim(),
    tgMessageId: null,
    takerName: null,
    takerEmail: null,
    createdAt: new Date().toISOString(),
    takenAt: null,
  };

  if (!offer.giver || !offer.date || !offer.shiftKey || offer.hours <= 0) {
    return c.json({ ok: false, error: 'Неверные данные' }, 400);
  }

  const tgRes = await tgApi(c.env, 'sendMessage', {
    chat_id: c.env.TG_CHAT_ID,
    text: offerTgText(offer),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[
      { text: '🙋 Забрать смену', callback_data: `so:t:${id}` },
      { text: '❌ Отозвать', callback_data: `so:c:${id}` },
    ]] },
  });

  if (tgRes.ok) {
    offer.tgMessageId = (tgRes.result as Record<string, unknown>)?.message_id as number ?? null;
  }

  await c.env.AUTH_KV.put(`offer:${id}`, JSON.stringify(offer), { expirationTtl: OFFER_TTL });

  // Сохраняем id в индекс месяца
  const idxKey = `offers:${offer.project}:${offer.month}`;
  const idxRaw = await c.env.AUTH_KV.get(idxKey);
  const idx: string[] = idxRaw ? JSON.parse(idxRaw) : [];
  if (!idx.includes(id)) idx.push(id);
  await c.env.AUTH_KV.put(idxKey, JSON.stringify(idx), { expirationTtl: OFFER_TTL });

  return c.json({ ok: true, id });
});

// GET /api/shift-offers?project=sg&month=2026-06 — список предложений
app.get('/api/shift-offers', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);

  const project = c.req.query('project') || 'sg';
  const month = c.req.query('month') || '';
  if (!month) return c.json({ ok: false, error: 'month обязателен' }, 400);

  const idxKey = `offers:${project}:${month}`;
  const idxRaw = await c.env.AUTH_KV.get(idxKey);
  const idx: string[] = idxRaw ? JSON.parse(idxRaw) : [];

  const offers: ShiftOffer[] = [];
  for (const id of idx) {
    const raw = await c.env.AUTH_KV.get(`offer:${id}`);
    if (raw) offers.push(JSON.parse(raw));
  }

  return c.json({ ok: true, offers });
});

// POST /api/shift-offer/take — забрать предложение (сессия определяет тейкера)
app.post('/api/shift-offer/take', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);

  const { offerId, takerName } = await c.req.json<{ offerId: string; takerName: string }>();
  if (!offerId || !takerName) return c.json({ ok: false, error: 'offerId и takerName обязательны' }, 400);

  const raw = await c.env.AUTH_KV.get(`offer:${offerId}`);
  if (!raw) return c.json({ ok: false, error: 'Предложение не найдено или истекло' }, 404);
  const offer: ShiftOffer = JSON.parse(raw);

  if (offer.status !== 'open') return c.json({ ok: false, error: `Предложение уже ${offer.status}` }, 409);
  if (offer.giverEmail === session.email) return c.json({ ok: false, error: 'Нельзя забрать своё предложение' }, 400);

  offer.status = 'taken';
  offer.takerName = takerName;
  offer.takerEmail = session.email;
  offer.takenAt = new Date().toISOString();
  await c.env.AUTH_KV.put(`offer:${offerId}`, JSON.stringify(offer), { expirationTtl: OFFER_TTL });

  // Обновляем TG-сообщение об оффере
  if (offer.tgMessageId) {
    await tgApi(c.env, 'editMessageText', {
      chat_id: c.env.TG_CHAT_ID,
      message_id: offer.tgMessageId,
      text: offerTgText(offer) + `\n\n🙋 <b>Забирает:</b> ${escTg(takerName)} — ожидает апрув TL`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    });
  }

  // Отправляем запрос на апрув TL (как обычный swap)
  const approvalRes = await tgApi(c.env, 'sendMessage', {
    chat_id: c.env.TG_CHAT_ID,
    text: offerApprovalTgText(offer),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[
      { text: '✅ Апрув', callback_data: `oa:a:${offerId}` },
      { text: '❌ Отказ', callback_data: `oa:d:${offerId}` },
    ]] },
  });

  const approvalMsgId = approvalRes.ok
    ? (approvalRes.result as Record<string, unknown>)?.message_id as number ?? null
    : null;

  offer.tgMessageId = approvalMsgId; // теперь это апрув-сообщение
  await c.env.AUTH_KV.put(`offer:${offerId}`, JSON.stringify(offer), { expirationTtl: OFFER_TTL });

  return c.json({ ok: true });
});

// POST /api/shift-offer/cancel — отозвать предложение (только свой оффер или TL)
app.post('/api/shift-offer/cancel', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ ok: false }, 401);

  const { offerId } = await c.req.json<{ offerId: string }>();
  if (!offerId) return c.json({ ok: false, error: 'offerId обязателен' }, 400);

  const raw = await c.env.AUTH_KV.get(`offer:${offerId}`);
  if (!raw) return c.json({ ok: false, error: 'Предложение не найдено' }, 404);
  const offer: ShiftOffer = JSON.parse(raw);

  if (offer.giverEmail !== session.email && session.role !== 'tl') {
    return c.json({ ok: false, error: 'Можно отозвать только своё предложение' }, 403);
  }
  if (offer.status !== 'open') {
    return c.json({ ok: false, error: `Нельзя отозвать — статус: ${offer.status}` }, 409);
  }

  offer.status = 'cancelled';
  await c.env.AUTH_KV.put(`offer:${offerId}`, JSON.stringify(offer), { expirationTtl: OFFER_TTL });

  if (offer.tgMessageId) {
    await tgApi(c.env, 'editMessageText', {
      chat_id: c.env.TG_CHAT_ID,
      message_id: offer.tgMessageId,
      text: offerTgText(offer) + `\n\n🚫 <b>Отозвано</b>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    });
  }

  return c.json({ ok: true });
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

// ── Health (liveness для Docker/реверс-прокси) ──────────────────────────────────

app.get('/api/health', (c) => c.json({ ok: true }));

// ── 404 ───────────────────────────────────────────────────────────────────────

app.all('*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
