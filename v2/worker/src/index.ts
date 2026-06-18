import { Hono } from 'hono';

// ── Типы окружения ────────────────────────────────────────────────────────────

type Env = {
  AUTH_KV: KVNamespace;
  ASSETS: Fetcher;
  RESEND_API_KEY: string;
  RESEND_FROM: string;            // напр. "SupportCIS <noreply@plevantis.net>"
  TG_BOT_TOKEN: string;
  TG_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SITE: string;
  TG_CHAT_ID: string;
  OWNER_EMAIL?: string;           // кто получает роль TL по умолчанию (bootstrap)
};

type Session = { email: string; role: string };

// ── Константы ─────────────────────────────────────────────────────────────────

const SESSION_TTL = 60 * 60 * 24 * 7; // сессия — 7 дней
const OTP_TTL = 60 * 10;              // код живёт 10 минут
const OTP_RESEND_COOLDOWN = 50;      // не чаще раза в 50 сек
const OTP_MAX_ATTEMPTS = 5;          // попыток ввода на один код
const ALLOWED_DOMAINS = ['velvix.org', 'gameup.club'];
const DEFAULT_OWNER = 'vitaliy.oliver@velvix.org';

type RoleLists = { tl: string[]; supervisor: string[]; ops: string[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  if (!email || !isAllowedEmail(email)) {
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

  c.header('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`);
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
      if (isAllowedEmail(e)) return true;
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
    return await r.json() as Record<string, unknown>;
  } catch { return { ok: false }; }
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

async function applySwapToSchedule(env: Env, rec: Record<string, unknown>, approver: string) {
  const key = scheduleKey(String(rec.project || 'sg'), String(rec.month));
  const raw = await env.AUTH_KV.get(key);
  const blob: ScheduleBlob = raw ? JSON.parse(raw) : emptyBlob();
  const overrides = { ...blob.overrides };
  const nowIso = new Date().toISOString();

  const gKey = `${rec.giver}:${rec.date}`;
  const g = overrides[gKey] ? { ...overrides[gKey] } : { type: rec.shiftType };
  if (!g.type) g.type = rec.shiftType as string;
  g.extraEvents = [...(g.extraEvents ?? []),
    { type: 'loss_swap_give', hours: rec.hours, range: rec.range, swapWith: rec.recipient, win: rec.win, withLunch: rec.withLunch }];
  g.editedBy = `swap-bot (${approver})`; g.editedAt = nowIso;
  overrides[gKey as string] = g;

  const rKey = `${rec.recipient}:${rec.date}`;
  const r = overrides[rKey] ? { ...overrides[rKey] } : {};
  if (!r.type || r.type === 'off' || r.type === 'birthday') r.type = SWAP_EXTRA_TYPE[rec.shiftType as string];
  r.extraEvents = [...(r.extraEvents ?? []),
    { type: 'extra_swap_take', hours: rec.hours, range: rec.range, swapWith: rec.giver, win: rec.win, withLunch: rec.withLunch }];
  r.editedBy = `swap-bot (${approver})`; r.editedAt = nowIso;
  overrides[rKey as string] = r;

  const newLog = [...(blob.log ?? []), {
    at: nowIso, by: `tg:${approver}`,
    action: `свап (бот): ${rec.giver} → ${rec.recipient} · ${rec.date} · ${rec.range} (${rec.hours}ч)`,
    target: String(rec.recipient),
  }].slice(-200);

  await env.AUTH_KV.put(key, JSON.stringify({ ...blob, overrides, version: Date.now(), log: newLog }));
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
    return c.text('forbidden', 403);
  }

  let update: Record<string, unknown>;
  try { update = await c.req.json(); } catch { return c.json({ ok: true }); }

  const cb = update?.callback_query as Record<string, unknown> | undefined;
  if (!cb?.data) return c.json({ ok: true });

  const m = String(cb.data).match(/^sw:(a|d):([0-9a-f-]{36})$/);
  if (!m) { await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id }); return c.json({ ok: true }); }

  const action = m[1];
  const id = m[2];
  const from = cb.from as Record<string, unknown>;
  const approver = from?.username ? `@${from.username}` : String(from?.first_name ?? 'неизвестно');
  const cbMsg = cb.message as Record<string, unknown>;

  const raw = await c.env.AUTH_KV.get(`swap:${id}`);
  if (!raw) {
    await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Заявка не найдена или истекла' });
    return c.json({ ok: true });
  }
  const rec = JSON.parse(raw) as Record<string, unknown>;

  if (rec.status !== 'pending') {
    await tgApi(c.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Уже: ${rec.status === 'approved' ? 'апрув' : 'отказ'}` });
    return c.json({ ok: true });
  }

  if (action === 'd') {
    rec.status = 'denied'; rec.decidedBy = approver; rec.decidedAt = new Date().toISOString();
    await c.env.AUTH_KV.put(`swap:${id}`, JSON.stringify(rec), { expirationTtl: SWAP_TTL });
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

// ── 404 ───────────────────────────────────────────────────────────────────────

app.all('*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
