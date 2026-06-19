import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EMPLOYEES_SEED } from '@/lib/seed';

const ROLE_LABELS: Record<string, string> = {
  tl: 'Team Lead', supervisor: 'Supervisor', ops: 'Ops', support: 'Support',
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function tenureText(sinceStr: string): string {
  if (!sinceStr || !/^\d{4}-\d{2}-\d{2}$/.test(sinceStr)) return '';
  const start = new Date(sinceStr + 'T00:00:00');
  const now = new Date();
  if (isNaN(start.getTime()) || start > now) return '';
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12), m = months % 12;
  const yW = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'год' : [2,3,4].includes(n%10) && ![12,13,14].includes(n%100) ? 'года' : 'лет';
  const mW = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'месяц' : [2,3,4].includes(n%10) && ![12,13,14].includes(n%100) ? 'месяца' : 'месяцев';
  const p: string[] = [];
  if (y > 0) p.push(`${y} ${yW(y)}`);
  if (m > 0) p.push(`${m} ${mW(m)}`);
  return p.length ? 'в команде ' + p.join(' ') : 'меньше месяца в команде';
}

function seedForEmail(email: string) {
  return Object.values(EMPLOYEES_SEED).find(e => e.email === email);
}

interface Me { email: string; role: string }
interface Profile { name: string; position: string; since: string; telegram: string }

export default function ProfilePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [telegram, setTelegram] = useState('');
  const [since, setSince] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/check', { credentials: 'include' });
        const d = await r.json();
        if (!d.ok) { navigate('/login?redirect=/profile', { replace: true }); return; }
        const myEmail = String(d.email).toLowerCase();
        setMe({ email: myEmail, role: d.role });

        const pr = await fetch(`/api/profile?email=${encodeURIComponent(myEmail)}`, { credentials: 'include' });
        const pd = await pr.json();
        const seed = seedForEmail(myEmail);
        const p: Profile = {
          name:     pd?.profile?.name     || (seed as { name?: string })?.name     || myEmail.split('@')[0],
          position: pd?.profile?.position || seed?.position || '',
          since:    pd?.profile?.since    || seed?.since    || '',
          telegram: pd?.profile?.telegram || '',
        };
        setProfile(p);
        setTelegram(p.telegram);
        setSince(p.since);
      } catch {
        navigate('/login?redirect=/profile', { replace: true });
      }
    })();
  }, [navigate]);

  function showToast(msg: string, kind: 'ok' | 'err') {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  }

  async function save() {
    const tgRaw = telegram.trim().replace(/^@+/, '');
    if (tgRaw && !/^[a-zA-Z0-9_]{3,32}$/.test(tgRaw)) {
      showToast('Некорректный телеграм-тег (3–32: латиница, цифры, _)', 'err');
      return;
    }
    const isTL = me?.role === 'tl';
    const payload: Record<string, string> = { email: me!.email, telegram: tgRaw };
    if (isTL) { payload.since = since; payload.name = profile!.name; payload.position = profile!.position; }

    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 401) { navigate('/login?redirect=/profile', { replace: true }); return; }
      if (res.ok && data.ok) {
        if (data.profile) {
          setProfile(p => ({ ...p!, ...data.profile }));
          // Отразить в полях нормализованные сервером значения (без @, обрезанная дата).
          if (typeof data.profile.telegram === 'string') setTelegram(data.profile.telegram);
          if (typeof data.profile.since === 'string') setSince(data.profile.since);
        }
        showToast('Сохранено', 'ok');
      } else {
        showToast(data.error || 'Не удалось сохранить', 'err');
      }
    } catch {
      showToast('Ошибка сети. Попробуйте ещё раз.', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
    navigate('/login', { replace: true });
  }

  if (!me || !profile) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>;
  }

  const isTL = me.role === 'tl';
  const tenure = tenureText(since);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Mulish', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;700&family=Mulish:wght@300;400;600&display=swap" rel="stylesheet" />

      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', width: 600, height: 600, borderRadius: '50%', filter: 'blur(120px)', opacity: 0.12, background: 'var(--accent)', top: -200, left: -100, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', width: 600, height: 600, borderRadius: '50%', filter: 'blur(120px)', opacity: 0.12, background: '#34d399', bottom: -200, right: -100, pointerEvents: 'none', zIndex: 0 }} />

      <button onClick={() => navigate(-1)} style={{ position: 'fixed', top: 24, left: 24, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', zIndex: 10, fontFamily: "'Mulish', sans-serif" }}>← На главную</button>
      <button onClick={logout} style={{ position: 'fixed', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--muted)', fontSize: 12, padding: '7px 14px', cursor: 'pointer', zIndex: 10, fontFamily: "'Mulish', sans-serif" }}>↩ Выйти</button>

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 60px' }}>
        {/* header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,var(--accent),#34d399)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 700, color: '#fff' }}>Support<span style={{ color: 'var(--accent)' }}>CIS</span></div>
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 11, fontWeight: 300, background: 'linear-gradient(90deg,var(--accent),#34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '0.22em', textTransform: 'uppercase' }}>Личный кабинет</div>
        </div>

        {/* card */}
        <div style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '32px 34px', width: '100%', maxWidth: 460, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg,transparent,var(--accent),transparent)', opacity: 0.6 }} />

          {/* identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26 }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, flexShrink: 0, background: 'linear-gradient(135deg,var(--accent),#3a7bd5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 22, color: '#fff' }}>
              {initials(profile.name)}
            </div>
            <div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{profile.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', marginTop: 4 }}>
                {profile.position || '—'}
                <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, marginLeft: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-sub)' }}>
                  {ROLE_LABELS[me.role] || me.role}
                </span>
              </div>
            </div>
          </div>

          {/* email (readonly) */}
          <Field label="Рабочая почта">
            <input value={me.email} readOnly style={inputStyle(true)} />
            <div style={noteStyle}>По этому адресу вы входите в портал. Изменить нельзя.</div>
          </Field>

          {/* telegram */}
          <Field label="Телеграм (рабочий аккаунт)">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 15, pointerEvents: 'none' }}>@</span>
              <input
                type="text"
                value={telegram}
                onChange={e => setTelegram(e.target.value)}
                placeholder="username"
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                style={{ ...inputStyle(false), paddingLeft: 34 }}
              />
            </div>
            <div style={noteStyle}>3–32 символа: латиница, цифры, нижнее подчёркивание.</div>
          </Field>

          {/* since */}
          <Field label="Дата начала работы">
            <input
              type="date"
              value={since}
              onChange={e => setSince(e.target.value)}
              disabled={!isTL}
              style={{ ...inputStyle(!isTL), colorScheme: 'dark' }}
            />
            <div style={noteStyle}>
              {isTL
                ? (since ? <><span style={{ color: '#34d399' }}>{tenure}</span>. Можно задать вручную.</> : 'Дата не указана. Можно задать вручную.')
                : (since ? <><span style={{ color: '#34d399' }}>{tenure}</span>. Дату начала меняет тимлид.</> : 'Дата начала пока не указана — её задаёт тимлид.')
              }
            </div>
          </Field>

          <button
            onClick={save}
            disabled={saving}
            style={{ width: '100%', marginTop: 8, padding: 14, background: saving ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,var(--accent),#3a7bd5)', border: 'none', borderRadius: 12, color: saving ? 'var(--muted)' : '#fff', fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? '...' : 'Сохранить'}
          </button>
        </div>

        <div style={{ marginTop: 28, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>© 2026 Velvix · Внутреннее использование</div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', background: 'var(--bg-card2)', border: `1px solid ${toast.kind === 'ok' ? '#34d399' : '#f87171'}`, color: 'var(--text)', padding: '11px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 60 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontFamily: "'Unbounded', sans-serif", fontSize: 10, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  background: disabled ? 'rgba(255,255,255,0.02)' : 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: disabled ? 'var(--text-sub)' : 'var(--text)',
  fontFamily: "'Mulish', sans-serif",
  fontSize: 15,
  padding: '13px 16px',
  outline: 'none',
  cursor: disabled ? 'default' : undefined,
});

const noteStyle: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', marginTop: 7, lineHeight: 1.5 };
