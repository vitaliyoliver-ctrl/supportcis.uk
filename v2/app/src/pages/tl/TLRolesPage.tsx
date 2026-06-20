import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PROJECTS } from '@/lib/projects';

// Управление ролями и профилями — порт tl/roles/index.html

const ROLES = [
  { key: 'tl' as const,         name: 'Team Leads',   desc: 'полный доступ' },
  { key: 'supervisor' as const, name: 'Супервайзеры', desc: 'график, support' },
  { key: 'ops' as const,        name: 'Ops',          desc: 'ops, support' },
];
type RoleKey = typeof ROLES[number]['key'];
const ALLOWED_DOMAINS = ['velvix.org', 'gameup.club', 'visiongridcore.com'];

// email → {name, position, since} из всех проектов графика (SG + НК).
// Первое вхождение по email выигрывает (основной проект — SG идёт первым).
const EMP_SEED: Record<string, { name: string; position: string; since: string }> = {};
for (const proj of Object.values(PROJECTS)) {
  for (const [name, emp] of Object.entries(proj.employees)) {
    const key = emp.email?.toLowerCase();
    if (key && !EMP_SEED[key]) EMP_SEED[key] = { name, position: emp.position, since: emp.since };
  }
}

interface Profile { name?: string; position?: string; since?: string; telegram?: string }
type Lists = Record<RoleKey, string[]>;

function seedFor(email: string) { return EMP_SEED[email.toLowerCase()] || {}; }

function tenureText(sinceStr: string): string {
  if (!sinceStr || !/^\d{4}-\d{2}-\d{2}$/.test(sinceStr)) return '';
  const start = new Date(sinceStr + 'T00:00:00'), now = new Date();
  if (isNaN(start.getTime()) || start > now) return '';
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12), m = months % 12;
  const yW = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'год' : [2,3,4].includes(n%10) && ![12,13,14].includes(n%100) ? 'года' : 'лет';
  const mW = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'месяц' : [2,3,4].includes(n%10) && ![12,13,14].includes(n%100) ? 'месяца' : 'месяцев';
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} ${yW(y)}`);
  if (m > 0) parts.push(`${m} ${mW(m)}`);
  return parts.length ? 'в команде ' + parts.join(' ') : 'меньше месяца в команде';
}

function emailValid(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  if (!ALLOWED_DOMAINS.includes(e.split('@')[1])) return null;
  return e;
}

function diffRole(orig: string[], cur: string[]) {
  return { added: cur.filter(x => !orig.includes(x)), removed: orig.filter(x => !cur.includes(x)) };
}

export default function TLRolesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [who, setWho] = useState('');
  const [original, setOriginal] = useState<Lists>({ tl: [], supervisor: [], ops: [] });
  const [state, setState] = useState<Lists>({ tl: [], supervisor: [], ops: [] });
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [addInputs, setAddInputs] = useState<Record<RoleKey, string>>({ tl: '', supervisor: '', ops: '' });
  const [addErrors, setAddErrors] = useState<Record<RoleKey, string>>({ tl: '', supervisor: '', ops: '' });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');

  // профиль-модалка
  const [pfEmail, setPfEmail] = useState<string | null>(null);
  const [pfName, setPfName] = useState('');
  const [pfPosition, setPfPosition] = useState('');
  const [pfTelegram, setPfTelegram] = useState('');
  const [pfSince, setPfSince] = useState('');

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, kind: 'ok' | 'err') => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const apiRoles = useCallback(async (method: string, body?: unknown) => {
    const init: RequestInit = { method, credentials: 'include' };
    if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
    const res = await fetch('/api/roles', init);
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* ignore */ }
    return { status: res.status, data };
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/profiles', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok && data.profiles) {
        const p: Record<string, Profile> = {};
        for (const [email, prof] of Object.entries(data.profiles)) p[email.toLowerCase()] = prof as Profile;
        setProfiles(p);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/check', { credentials: 'include' });
        if (r.ok) {
          const c = await r.json();
          if (c.ok) { setMyEmail((c.email || '').toLowerCase()); setWho(`${c.email} · ${c.role}`); }
        }
      } catch { /* ignore */ }

      try {
        const { status, data } = await apiRoles('GET');
        if (status === 401) { navigate('/login'); return; }
        if (status === 403) { setFatal('Доступ к этой странице есть только у Team Lead.'); setLoading(false); return; }
        const lists = data.lists as Lists | undefined;
        if (!data.ok || !lists) { setFatal('Не удалось загрузить списки ролей.'); setLoading(false); return; }
        const orig: Lists = { tl: (lists.tl || []).slice(), supervisor: (lists.supervisor || []).slice(), ops: (lists.ops || []).slice() };
        setOriginal(orig);
        setState(JSON.parse(JSON.stringify(orig)));
        setLoading(false);
        loadProfiles();
      } catch {
        setFatal('Сеть недоступна. Обнови страницу.');
        setLoading(false);
      }
    })();
  }, [apiRoles, loadProfiles, navigate]);

  const dirty = ROLES.some(r => { const d = diffRole(original[r.key], state[r.key]); return d.added.length || d.removed.length; });

  // Ростер команды: все люди из графика (сид) + все, у кого есть профиль.
  const rosterEmails = (() => {
    const set = new Set(Object.keys(EMP_SEED));
    Object.keys(profiles).forEach(e => set.add(e));
    return [...set];
  })();
  const rq = rosterSearch.trim().toLowerCase();
  const rosterPeople = rosterEmails
    .map(e => ({ email: e, name: displayName(e), position: profiles[e]?.position || seedFor(e).position || '' }))
    .filter(x => !rq || x.name.toLowerCase().includes(rq) || x.email.includes(rq) || x.position.toLowerCase().includes(rq))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  function displayName(email: string) {
    return profiles[email]?.name || seedFor(email).name || email.split('@')[0];
  }

  function addEmail(role: RoleKey) {
    setAddErrors(p => ({ ...p, [role]: '' }));
    const e = emailValid(addInputs[role]);
    if (!e) { setAddErrors(p => ({ ...p, [role]: 'Некорректный email или домен не из списка' })); return; }
    if (state[role].includes(e)) { setAddErrors(p => ({ ...p, [role]: 'Уже в списке' })); return; }
    setState(p => ({ ...p, [role]: [...p[role], e] }));
    setAddInputs(p => ({ ...p, [role]: '' }));
  }

  async function doSave() {
    setSaving(true);
    try {
      const { status, data } = await apiRoles('POST', { tl: state.tl, supervisor: state.supervisor, ops: state.ops });
      if (status === 200 && data.ok) {
        const lists = data.lists as Lists;
        setOriginal(JSON.parse(JSON.stringify(lists)));
        setState(JSON.parse(JSON.stringify(lists)));
        setConfirmOpen(false);
        const rejected = data.rejected as string[] | undefined;
        if (rejected?.length) showToast('Сохранено. Отклонено: ' + rejected.join(', '), 'err');
        else showToast('Сохранено', 'ok');
      } else if (status === 400 && data.error) { setConfirmOpen(false); showToast(String(data.error), 'err'); }
      else if (status === 403) { setConfirmOpen(false); showToast('Доступ только для TL', 'err'); }
      else if (status === 401) { navigate('/login'); }
      else { setConfirmOpen(false); showToast('Ошибка сохранения', 'err'); }
    } catch { setConfirmOpen(false); showToast('Сеть недоступна', 'err'); }
    finally { setSaving(false); }
  }

  function openProfile(email: string) {
    const stored = profiles[email] || {}, seed = seedFor(email);
    setPfEmail(email);
    setPfName(stored.name || seed.name || '');
    setPfPosition(stored.position || seed.position || '');
    setPfTelegram(stored.telegram || '');
    setPfSince(stored.since || seed.since || '');
  }

  async function saveProfile() {
    if (!pfEmail) return;
    const tg = pfTelegram.trim().replace(/^@+/, '');
    if (tg && !/^[a-zA-Z0-9_]{3,32}$/.test(tg)) { showToast('Некорректный телеграм-тег (3–32: латиница, цифры, _)', 'err'); return; }
    if (pfSince && !/^\d{4}-\d{2}-\d{2}$/.test(pfSince)) { showToast('Некорректная дата', 'err'); return; }
    const payload = { email: pfEmail, name: pfName.trim(), position: pfPosition.trim(), telegram: tg, since: pfSince };
    try {
      const res = await fetch('/api/profile', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { navigate('/login'); return; }
      if (res.ok && data.ok) {
        setProfiles(p => ({ ...p, [pfEmail]: data.profile || payload }));
        setPfEmail(null);
        showToast('Профиль сохранён', 'ok');
      } else showToast(data.error || 'Не удалось сохранить', 'err');
    } catch { showToast('Сеть недоступна', 'err'); }
  }

  async function deleteProfile() {
    if (!pfEmail) return;
    if (!confirm(`Удалить профиль ${pfEmail}? Роли при этом не меняются.`)) return;
    try {
      const res = await fetch('/api/profile?email=' + encodeURIComponent(pfEmail), { method: 'DELETE', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { navigate('/login'); return; }
      if (res.ok && data.ok) {
        setProfiles(p => { const n = { ...p }; delete n[pfEmail]; return n; });
        setPfEmail(null);
        showToast('Профиль удалён', 'ok');
      } else showToast(data.error || 'Не удалось удалить', 'err');
    } catch { showToast('Сеть недоступна', 'err'); }
  }

  const C = {
    bg: '#0a0c10', panel: '#111318', panel2: '#15181f', border: '#1f2937', border2: '#2a3441',
    accent: '#4f8ef7', accentDim: '#1e3a6b', text: '#e5e7eb', muted: '#9ca3af', faint: '#6b7280',
    danger: '#ef4444', dangerDim: '#3a1d1d', success: '#22c55e', successDim: '#14321f',
  };

  if (loading) return <div style={{ background: C.bg, minHeight: '100vh', color: C.muted, textAlign: 'center', padding: '80px 20px' }}>Загрузка…</div>;
  if (fatal) return <div style={{ background: C.bg, minHeight: '100vh', color: C.danger, textAlign: 'center', padding: '80px 20px' }}>{fatal}</div>;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif", fontSize: 14 }}>
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '28px 20px 80px' }}>
        <button onClick={() => navigate('/tl')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, color: C.muted, fontSize: 13, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 9, padding: '7px 13px', cursor: 'pointer', fontFamily: 'inherit' }}>← Назад в раздел TL</button>

        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Support<span style={{ color: C.accent }}>CIS</span></div>
          {who && <div style={{ color: C.faint, fontSize: 13 }}><b style={{ color: C.muted, fontWeight: 600 }}>{who.split(' · ')[0]}</b> · {who.split(' · ')[1] || ''}</div>}
        </header>

        <h1 style={{ fontSize: 16, fontWeight: 600, margin: '18px 0 4px' }}>Управление ролями и профилями</h1>
        <p style={{ color: C.faint, fontSize: 13, margin: '0 0 4px', maxWidth: '70ch' }}>Добавляй и убирай доступы по ролям. Кликни по email — откроется профиль человека.</p>

        <div style={{ margin: '14px 0 22px', padding: '11px 14px', borderRadius: 10, background: C.panel, border: `1px solid ${C.border}`, color: C.muted, fontSize: 12.5 }}>
          <b style={{ color: C.text }}>Важно:</b> роль вмораживается в сессию при входе. Новый человек получит доступ при первом логине, а у изменённого старая роль живёт до релогина (до 7 дней). Домены: velvix.org, gameup.club, visiongridcore.com.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {ROLES.map(role => {
            const cur = state[role.key], orig = original[role.key];
            const removed = orig.filter(x => !cur.includes(x));
            const shown = [...cur.map(e => ({ e, del: false })), ...removed.map(e => ({ e, del: true }))];
            return (
              <div key={role.key} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                  <div><div style={{ fontWeight: 600, fontSize: 14 }}>{role.name}</div><div style={{ color: C.faint, fontSize: 11.5, marginTop: 2 }}>{role.desc}</div></div>
                  <div style={{ fontSize: 12, color: C.muted, background: C.panel2, border: `1px solid ${C.border2}`, borderRadius: 999, padding: '2px 9px' }}>{cur.length}</div>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                  {!shown.length && <div style={{ color: C.faint, fontSize: 12.5, padding: '14px 10px', textAlign: 'center' }}>Пусто</div>}
                  {shown.map(({ e, del }) => {
                    const isSelf = e === myEmail, isAdd = !del && !orig.includes(e);
                    const lockSelf = role.key === 'tl' && isSelf && !del;
                    const prof = profiles[e];
                    return (
                      <div key={e + (del ? '_d' : '')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: del ? '#1a1010' : isAdd ? '#101a13' : C.panel2, border: `1px solid ${del ? C.dangerDim : isAdd ? C.successDim : C.border2}`, borderRadius: 9, padding: '7px 8px 7px 11px', opacity: del ? 0.7 : 1 }}>
                        {prof?.telegram && <span style={{ flexShrink: 0, fontSize: 11, color: C.accent, background: C.accentDim, borderRadius: 5, padding: '1px 6px' }}>@{prof.telegram}</span>}
                        <span onClick={() => openProfile(e)} style={{ flex: 1, fontSize: 13, wordBreak: 'break-all', cursor: 'pointer', textDecoration: del ? 'line-through' : undefined, color: del ? C.faint : undefined }} title="Открыть профиль">{e}{isSelf && !del && <span style={{ marginLeft: 7, fontSize: 10.5, color: C.accent, background: C.accentDim, borderRadius: 5, padding: '1px 6px' }}>вы</span>}</span>
                        {del ? (
                          <button onClick={() => setState(p => ({ ...p, [role.key]: [...p[role.key], e] }))} style={btnX(C)} title="Вернуть">↺</button>
                        ) : (
                          <button disabled={lockSelf} onClick={() => !lockSelf && setState(p => ({ ...p, [role.key]: p[role.key].filter(x => x !== e) }))} style={{ ...btnX(C), color: lockSelf ? '#374151' : C.faint, cursor: lockSelf ? 'not-allowed' : 'pointer' }} title={lockSelf ? 'Нельзя удалить себя из TL' : 'Убрать'}>×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderTop: `1px solid ${C.border}` }}>
                  <input value={addInputs[role.key]} onChange={e => setAddInputs(p => ({ ...p, [role.key]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addEmail(role.key)} placeholder="email@velvix.org" autoCapitalize="off" spellCheck={false} style={{ flex: 1, background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                  <button onClick={() => addEmail(role.key)} style={{ background: C.accentDim, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 8, padding: '0 13px', cursor: 'pointer', fontSize: 18 }}>+</button>
                </div>
                {addErrors[role.key] && <div style={{ color: C.danger, fontSize: 11.5, padding: '0 12px 8px' }}>{addErrors[role.key]}</div>}
              </div>
            );
          })}
        </div>

        {/* Команда — профили: все люди из графика, у каждого есть карточка */}
        <div style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Команда — профили <span style={{ color: C.faint, fontWeight: 400 }}>{rosterPeople.length}</span></h2>
              <div style={{ color: C.faint, fontSize: 12.5, marginTop: 2 }}>Все люди из графика (SG и НК). Кликни по карточке — откроется профиль: имя, позиция, телеграм, дата начала.</div>
            </div>
            <input value={rosterSearch} onChange={e => setRosterSearch(e.target.value)} placeholder="Поиск по имени, email, позиции…" autoCapitalize="off" spellCheck={false} style={{ background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', minWidth: 240 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 8 }}>
            {!rosterPeople.length && <div style={{ color: C.faint, fontSize: 12.5, padding: '14px 10px' }}>Никого не найдено</div>}
            {rosterPeople.map(x => {
              const prof = profiles[x.email];
              return (
                <div key={x.email} onClick={() => openProfile(x.email)} title="Открыть профиль"
                  style={{ display: 'flex', flexDirection: 'column', gap: 4, background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.accent; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border2; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{x.name}</span>
                    {x.position && <span style={{ fontSize: 11, color: C.muted, background: C.panel2, border: `1px solid ${C.border2}`, borderRadius: 5, padding: '1px 7px' }}>{x.position}</span>}
                    {prof?.telegram && <span style={{ fontSize: 11, color: C.accent, background: C.accentDim, borderRadius: 5, padding: '1px 6px' }}>@{prof.telegram}</span>}
                  </div>
                  <span style={{ fontSize: 11.5, color: C.faint, wordBreak: 'break-all' }}>{x.email}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ position: 'sticky', bottom: 0, marginTop: 22, padding: '14px 0 0', display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ color: dirty ? C.muted : C.faint, fontSize: 13, marginRight: 'auto' }}>{dirty ? 'Есть несохранённые изменения' : 'Изменений нет'}</div>
          <button disabled={!dirty} onClick={() => setState(JSON.parse(JSON.stringify(original)))} style={{ ...btnBase, background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted, opacity: dirty ? 1 : 0.5, cursor: dirty ? 'pointer' : 'not-allowed' }}>Сбросить</button>
          <button disabled={!dirty} onClick={() => setConfirmOpen(true)} style={{ ...btnBase, background: C.accent, color: '#07101f', opacity: dirty ? 1 : 0.5, cursor: dirty ? 'pointer' : 'not-allowed' }}>Сохранить</button>
        </div>
      </div>

      {confirmOpen && (
        <Overlay onClose={() => setConfirmOpen(false)} C={C}>
          <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Подтвердите изменения</h2>
          <p style={{ color: C.faint, fontSize: 13, margin: '0 0 16px' }}>Эти правки применятся к спискам ролей.</p>
          <div>
            {ROLES.map(role => {
              const d = diffRole(original[role.key], state[role.key]);
              if (!d.added.length && !d.removed.length) return null;
              return (
                <div key={role.key} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{role.name}</div>
                  {d.added.map(e => <div key={e} style={{ fontSize: 13, display: 'flex', gap: 7, padding: '2px 0', wordBreak: 'break-all' }}><span style={{ flexShrink: 0, fontWeight: 700, width: 14, color: C.success }}>+</span><span>{e}</span></div>)}
                  {d.removed.map(e => <div key={e} style={{ fontSize: 13, display: 'flex', gap: 7, padding: '2px 0', wordBreak: 'break-all' }}><span style={{ flexShrink: 0, fontWeight: 700, width: 14, color: C.danger }}>−</span><span style={{ color: C.faint }}>{e}</span></div>)}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={() => setConfirmOpen(false)} style={{ ...btnBase, background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted }}>Отмена</button>
            <button disabled={saving} onClick={doSave} style={{ ...btnBase, background: C.accent, color: '#07101f', opacity: saving ? 0.5 : 1 }}>Сохранить</button>
          </div>
        </Overlay>
      )}

      {pfEmail && (
        <Overlay onClose={() => setPfEmail(null)} C={C}>
          <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{displayName(pfEmail)}</h2>
          <p style={{ color: C.faint, fontSize: 13, margin: '0 0 16px', wordBreak: 'break-all' }}>{pfEmail}</p>
          <div style={{ fontSize: 12, color: C.faint, margin: '-4px 0 14px' }}>
            {(() => { const rs = ROLES.filter(r => state[r.key].includes(pfEmail)).map(r => r.name); return rs.length ? <>Роли: {rs.map(r => <span key={r} style={{ display: 'inline-block', background: C.panel2, border: `1px solid ${C.border2}`, borderRadius: 6, padding: '1px 8px', marginRight: 5, color: C.muted, fontSize: 11 }}>{r}</span>)}</> : <span style={{ color: C.faint }}>Без роли (только профиль)</span>; })()}
          </div>
          <PfField label="Имя" C={C}><input value={pfName} onChange={e => setPfName(e.target.value)} maxLength={60} placeholder="Например, Oliver" style={pfInput(C)} /></PfField>
          <PfField label="Позиция" C={C}><input value={pfPosition} onChange={e => setPfPosition(e.target.value)} maxLength={60} placeholder="Support, Supervisor, VIP..." style={pfInput(C)} /></PfField>
          <PfField label="Телеграм" C={C}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.faint, fontSize: 13.5, pointerEvents: 'none' }}>@</span>
              <input value={pfTelegram} onChange={e => setPfTelegram(e.target.value)} maxLength={32} placeholder="username" autoCapitalize="off" spellCheck={false} style={{ ...pfInput(C), paddingLeft: 26 }} />
            </div>
          </PfField>
          <PfField label="Дата начала работы" C={C}><input type="date" value={pfSince} onChange={e => setPfSince(e.target.value)} style={{ ...pfInput(C), colorScheme: 'dark' }} /></PfField>
          <div style={{ fontSize: 12, color: C.faint, margin: '4px 0', minHeight: 16 }}>{tenureText(pfSince) ? <span style={{ color: C.success }}>{tenureText(pfSince)}</span> : 'Дата начала берётся из графика; можно задать вручную.'}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 18 }}>
            <button onClick={deleteProfile} style={{ ...btnBase, background: C.dangerDim, border: `1px solid ${C.danger}`, color: '#fca5a5', visibility: profiles[pfEmail] ? 'visible' : 'hidden' }}>Удалить профиль</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPfEmail(null)} style={{ ...btnBase, background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted }}>Отмена</button>
              <button onClick={saveProfile} style={{ ...btnBase, background: C.accent, color: '#07101f' }}>Сохранить</button>
            </div>
          </div>
        </Overlay>
      )}

      {toast && <div style={{ position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', background: C.panel2, border: `1px solid ${toast.kind === 'ok' ? C.success : C.danger}`, color: C.text, padding: '11px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 60 }}>{toast.msg}</div>}
    </div>
  );
}

const btnBase: React.CSSProperties = { fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: 10, padding: '10px 18px', border: '1px solid transparent' };
const btnX = (C: { faint: string }): React.CSSProperties => ({ border: 0, background: 'transparent', color: C.faint, cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '2px 5px', borderRadius: 6, flexShrink: 0 });
const pfInput = (C: { bg: string; border2: string; text: string }): React.CSSProperties => ({ width: '100%', background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text, padding: '9px 11px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' });

function PfField({ label, C, children }: { label: string; C: { faint: string }; children: React.ReactNode }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>{label}</label>{children}</div>;
}

function Overlay({ onClose, C, children }: { onClose: () => void; C: { panel: string; border2: string }; children: React.ReactNode }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
      <div style={{ background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 16, maxWidth: 460, width: '100%', padding: 22, maxHeight: '80vh', overflowY: 'auto' }}>{children}</div>
    </div>
  );
}
