import { useEffect, useId, useMemo, useState } from 'react';
import BackButton from '@/components/BackButton';
import { listTickets, listTeams, listTags, addTags, removeTag, replyTicket, createTicket, getSavedFilters, saveSavedFilters, type Ticket, type TicketEvent, type Team, type Tag, type SavedFilter } from '@/lib/helpdeskApi';

// Все 5 статусов HelpDesk (значения API; on hold = onhold).
const STATUSES: [string, string][] = [
  ['open', 'Открыт'], ['pending', 'Ожидает'], ['onhold', 'На удержании'], ['solved', 'Решён'], ['closed', 'Закрыт'],
];
// Приоритеты тикета (enum HelpDesk: -10 / 0 / 10 / 20).
const PRIORITIES: [string, string][] = [
  ['-10', 'Низкий'], ['0', 'Средний'], ['10', 'Высокий'], ['20', 'Срочный'],
];

// Комбобокс команды с автоподстановкой (нативный datalist): ввод фильтрует список.
function TeamCombo({ teams, valueID, onPick, placeholder, style }: {
  teams: Team[]; valueID: string; onPick: (id: string) => void; placeholder: string; style: React.CSSProperties;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  useEffect(() => { setText(teams.find(x => x.ID === valueID)?.name || ''); }, [valueID, teams]);
  return (
    <>
      <input list={listId} value={text} placeholder={placeholder}
        onChange={e => { const v = e.target.value; setText(v); const m = teams.find(x => x.name === v); onPick(m ? m.ID : ''); }}
        style={style} />
      <datalist id={listId}>{teams.map(x => <option key={x.ID} value={x.name} />)}</datalist>
    </>
  );
}

// Своя тикет-система поверх HelpDesk: список, поиск, детальный тикет с перепиской,
// инфо-панель, тикеты пользователя, ответ и создание. Почты замаскированы на бэке.
// Поддерживает тёмную/светлую тему (только эта страница), выбор хранится в localStorage.

const mono = "'JetBrains Mono', monospace";

// ── Палитра темы ──────────────────────────────────────────────────────────────
interface Theme {
  bg: string; headerGrad: string; panel: string; border: string; text: string;
  dim: string; faint: string; faint2: string; inputBg: string; selected: string;
  msgClient: string; msgAgent: string; msgPriv: string; overlay: string; scheme: 'dark' | 'light';
}
const DARK: Theme = {
  bg: '#0f1117', headerGrad: 'linear-gradient(135deg,#1a1d27,#0f1117)', panel: '#161922', border: '#2a2e3d',
  text: '#e8e6f0', dim: '#8b8a9e', faint: '#6b7280', faint2: '#5a5970', inputBg: '#1a1d27',
  selected: 'rgba(79,142,247,0.10)', msgClient: 'rgba(255,255,255,0.03)', msgAgent: 'rgba(79,142,247,0.08)',
  msgPriv: '#0f1117', overlay: 'rgba(0,0,0,0.6)', scheme: 'dark',
};
const LIGHT: Theme = {
  bg: '#f4f6fb', headerGrad: 'linear-gradient(135deg,#eef2f9,#f4f6fb)', panel: '#ffffff', border: '#d9dee8',
  text: '#1a1d27', dim: '#5b6472', faint: '#7b8494', faint2: '#9aa3b2', inputBg: '#ffffff',
  selected: 'rgba(79,142,247,0.12)', msgClient: '#f1f3f8', msgAgent: 'rgba(79,142,247,0.10)',
  msgPriv: '#fff8e6', overlay: 'rgba(0,0,0,0.35)', scheme: 'light',
};

const STATUS_COLOR: Record<string, string> = { open: '#4f8ef7', pending: '#e0a800', solved: '#00a884', closed: '#8b8a9e' };
function statusColor(s?: string) { return STATUS_COLOR[(s || '').toLowerCase()] || '#8b8a9e'; }

function fmt(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <>{parts.map((p, i) => /^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: '#4f8ef7', wordBreak: 'break-all' }}>ссылка ↗</a>
    : <span key={i}>{p}</span>)}</>;
}

function eventSummary(e: TicketEvent): string | null {
  switch (e.type) {
    case 'status': return `статус: ${e.status?.old ?? '—'} → ${e.status?.new ?? '—'}`;
    case 'assignment': {
      const a = e.assignment; const parts: string[] = [];
      const ot = a?.old?.team?.name, nt = a?.new?.team?.name;
      if (ot || nt) parts.push(`группа: ${ot || '—'} → ${nt || '—'}`);
      const oa = a?.old?.agent?.name?.trim(), na = a?.new?.agent?.name?.trim();
      if (oa || na) parts.push(`агент: ${oa || '—'} → ${na || '—'}`);
      return parts.join('; ') || 'изменено назначение';
    }
    case 'tags': return 'изменены теги';
    case 'teamVisibility': return 'изменена видимость команд';
    case 'customFields': return 'обновлены доп. поля';
    case 'followers': return 'изменены наблюдатели';
    default: return null;
  }
}

const boxOf = (t: Theme): React.CSSProperties => ({ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 10 });
const inputOf = (t: Theme): React.CSSProperties => ({ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontFamily: mono });

function StatusBadge({ status }: { status?: string }) {
  const c = statusColor(status);
  return <span style={{ fontSize: 11, fontFamily: mono, color: c, border: `1px solid ${c}55`, background: `${c}18`, padding: '2px 8px', borderRadius: 20 }}>{status || '—'}</span>;
}

export default function TicketsPage() {
  const [dark, setDark] = useState(() => (typeof localStorage !== 'undefined' ? localStorage.getItem('tickets-theme') !== 'light' : true));
  const t = dark ? DARK : LIGHT;
  const box = boxOf(t), input = inputOf(t);
  function toggleTheme() {
    setDark(d => { const next = !d; try { localStorage.setItem('tickets-theme', next ? 'dark' : 'light'); } catch { /* noop */ } return next; });
  }

  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selId, setSelId] = useState('');
  const [reply, setReply] = useState('');
  const [replyPrivate, setReplyPrivate] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [searched, setSearched] = useState(false);

  const [fStatuses, setFStatuses] = useState<string[]>([]);
  const [fTeams, setFTeams] = useState<string[]>([]);
  const [fCreatedFrom, setFCreatedFrom] = useState('');
  const [fCreatedTo, setFCreatedTo] = useState('');
  const [fActiveFrom, setFActiveFrom] = useState('');
  const [fActiveTo, setFActiveTo] = useState('');
  const [teamComboKey, setTeamComboKey] = useState(0); // для очистки комбобокса после добавления

  // Персональные сохранённые фильтры
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [appliedName, setAppliedName] = useState('');
  useEffect(() => { getSavedFilters().then(setSaved).catch(() => { /* опционально */ }); }, []);

  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ subject: '', email: '', name: '', text: '', teamID: '', priority: '0', status: 'open' });
  const [creating, setCreating] = useState(false);

  const [allTeams, setAllTeams] = useState<Team[]>([]);
  useEffect(() => { listTeams().then(setAllTeams).catch(() => { /* список групп опционален */ }); }, []);
  // Команды по алфавиту — для фильтра и формы создания.
  const sortedTeams = useMemo(() => [...allTeams].sort((a, b) => a.name.localeCompare(b.name, 'ru')), [allTeams]);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  useEffect(() => { listTags().then(setAllTags).catch(() => { /* теги опциональны */ }); }, []);
  const tagName = (id: string) => allTags.find(x => x.ID === id)?.name || id;
  const [tagComboKey, setTagComboKey] = useState(0);
  async function addTicketTag(tagId: string) {
    if (!tagId || !selId || selected?.tagIDs?.includes(tagId)) return;
    setTagComboKey(k => k + 1);
    try { await addTags(selId, [tagId]); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
  }
  async function removeTicketTag(tagId: string) {
    if (!selId) return;
    try { await removeTag(selId, tagId); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
  }

  // Вся фильтрация серверная — показываем rows как есть.
  const filtered = rows;

  const selected = useMemo(() => rows.find(r => r.ID === selId) || null, [rows, selId]);
  const requesterTickets = useMemo(() => {
    if (!selected?.requester?.email) return [];
    return rows.filter(r => r.requester?.email === selected.requester?.email && r.ID !== selected.ID);
  }, [rows, selected]);

  // Все фильтры применяются на сервере (по всей базе). Любая смена фильтра = запрос.
  // ov позволяет передать новые значения, не дожидаясь обновления state.
  // Статусы HelpDesk фильтруются по одному значению, поэтому для нескольких
  // делаем параллельные запросы и объединяем результат по ID.
  async function load(ov: { statuses?: string[]; teams?: string[]; cf?: string; ct?: string; af?: string; at?: string } = {}) {
    const statuses = ov.statuses ?? fStatuses;
    const teams = ov.teams ?? fTeams;
    setLoading(true); setErr(''); setSearched(true);
    const common = {
      query: query.trim() || undefined,
      teamIDs: teams.length ? teams : undefined,
      createdFrom: (ov.cf ?? fCreatedFrom) || undefined,
      createdTo: (ov.ct ?? fCreatedTo) || undefined,
      activeFrom: (ov.af ?? fActiveFrom) || undefined,
      activeTo: (ov.at ?? fActiveTo) || undefined,
    };
    try {
      let data: Ticket[];
      if (statuses.length <= 1) {
        data = await listTickets({ ...common, status: statuses[0] });
      } else {
        const parts = await Promise.all(statuses.map(s => listTickets({ ...common, status: s })));
        const map = new Map<string, Ticket>();
        for (const arr of parts) for (const tk of arr) map.set(tk.ID, tk);
        data = [...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      }
      // teamIDs[] на сервере фильтрует по видимости (включая команду создания после
      // перевода). Дофильтровываем по ТЕКУЩЕЙ назначенной группе — назначенная
      // команда всегда входит в видимость, поэтому нужные тикеты не теряются.
      if (teams.length) {
        const set = new Set(teams);
        data = data.filter(r => {
          const tid = (r.assignment?.team as { ID?: string } | null | undefined)?.ID;
          return tid ? set.has(tid) : false;
        });
      }
      setRows(data);
      if (!data.find(r => r.ID === selId)) setSelId('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLoading(false); }
  }
  function search(e?: React.FormEvent) { e?.preventDefault(); return load(); }

  function toggleStatus(s: string) {
    const next = fStatuses.includes(s) ? fStatuses.filter(x => x !== s) : [...fStatuses, s];
    setFStatuses(next); setAppliedName(''); load({ statuses: next });
  }
  function addTeam(id: string) {
    if (!id || fTeams.includes(id)) return;
    const next = [...fTeams, id];
    setFTeams(next); setAppliedName(''); setTeamComboKey(k => k + 1); load({ teams: next });
  }
  function removeTeam(id: string) {
    const next = fTeams.filter(x => x !== id);
    setFTeams(next); setAppliedName(''); load({ teams: next });
  }
  function resetFilters() {
    setFStatuses([]); setFTeams([]); setFCreatedFrom(''); setFCreatedTo(''); setFActiveFrom(''); setFActiveTo(''); setAppliedName('');
    load({ statuses: [], teams: [], cf: '', ct: '', af: '', at: '' });
  }

  function applySaved(name: string) {
    const f = saved.find(x => x.name === name);
    if (!f) { setAppliedName(''); return; }
    setFStatuses(f.statuses || []); setFTeams(f.teamIDs || []);
    setFCreatedFrom(f.createdFrom || ''); setFCreatedTo(f.createdTo || '');
    setFActiveFrom(f.activeFrom || ''); setFActiveTo(f.activeTo || '');
    setAppliedName(name);
    load({ statuses: f.statuses || [], teams: f.teamIDs || [], cf: f.createdFrom || '', ct: f.createdTo || '', af: f.activeFrom || '', at: f.activeTo || '' });
  }
  async function saveCurrent() {
    const name = window.prompt('Название фильтра:')?.trim();
    if (!name) return;
    const entry: SavedFilter = {
      name, statuses: fStatuses, teamIDs: fTeams,
      createdFrom: fCreatedFrom, createdTo: fCreatedTo, activeFrom: fActiveFrom, activeTo: fActiveTo,
    };
    const next = [...saved.filter(x => x.name !== name), entry];
    setSaved(next); setAppliedName(name);
    try { await saveSavedFilters(next); setNotice('Фильтр сохранён'); } catch { setErr('Не удалось сохранить фильтр'); }
  }
  async function deleteSaved(name: string) {
    const next = saved.filter(x => x.name !== name);
    setSaved(next); if (appliedName === name) setAppliedName('');
    try { await saveSavedFilters(next); } catch { setErr('Не удалось удалить фильтр'); }
  }

  async function send() {
    if (!reply.trim() || !selId) return;
    setSending(true); setErr(''); setNotice('');
    try {
      await replyTicket(selId, reply.trim(), replyPrivate);
      setReply(''); setNotice(replyPrivate ? 'Заметка добавлена' : 'Ответ отправлен');
      const data = await listTickets({ query: query.trim() || undefined });
      setRows(data);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка отправки'); }
    finally { setSending(false); }
  }

  async function create() {
    if (!nf.subject.trim() || !nf.text.trim()) { setErr('Заполните тему и сообщение'); return; }
    setCreating(true); setErr('');
    try {
      await createTicket({
        subject: nf.subject.trim(),
        message: { text: nf.text.trim() },
        requester: { email: nf.email.trim(), name: nf.name.trim() || undefined },
        teamIDs: nf.teamID ? [nf.teamID] : undefined,
        priority: Number(nf.priority),
        status: nf.status,
      });
      setShowNew(false); setNf({ subject: '', email: '', name: '', text: '', teamID: '', priority: '0', status: 'open' });
      setNotice('Тикет создан'); await search();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка создания'); }
    finally { setCreating(false); }
  }

  const sectionTitle: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: t.dim, marginBottom: 8, fontFamily: mono };

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ background: t.headerGrad, borderBottom: `1px solid ${t.border}`, padding: '20px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <BackButton to="/support" inline />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f8ef7', boxShadow: '0 0 12px #4f8ef7' }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, fontFamily: mono, letterSpacing: '-0.02em' }}>Тикеты</h1>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button onClick={toggleTheme} title="Сменить тему" style={{ ...input, cursor: 'pointer' }}>{dark ? '☀️ Светлая' : '🌙 Тёмная'}</button>
            <button onClick={() => { setShowNew(true); setErr(''); }} style={{ ...input, cursor: 'pointer', background: '#4f8ef7', borderColor: '#4f8ef7', color: '#fff', fontWeight: 600 }}>+ Новый тикет</button>
          </div>
        </div>
        <p style={{ marginLeft: 20, fontSize: 12, color: t.dim }}>Поиск и ответы · адреса клиентов замаскированы</p>
      </div>

      <div style={{ padding: '20px 28px' }}>
        <form onSubmit={search} style={{ display: 'flex', gap: 10, marginBottom: 16, maxWidth: 720 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по тикетам (тема, текст, № тикета)…" style={{ ...input, flex: 1 }} />
          <button type="submit" disabled={loading} style={{ ...input, cursor: 'pointer', background: '#4f8ef7', borderColor: '#4f8ef7', color: '#fff', fontWeight: 600 }}>{loading ? '…' : 'Найти'}</button>
        </form>

        {searched && (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Статусы — мультивыбор */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {STATUSES.map(([v, l]) => {
                const on = fStatuses.includes(v); const c = statusColor(v);
                return (
                  <button key={v} onClick={() => toggleStatus(v)} style={{ ...input, cursor: 'pointer', padding: '6px 12px', fontSize: 12,
                    background: on ? `${c}22` : 'transparent', borderColor: on ? c : t.border, color: on ? c : t.dim, fontWeight: on ? 600 : 400 }}>
                    {on ? '✓ ' : ''}{l}
                  </button>
                );
              })}
            </div>

            {/* Группы — мультивыбор с автоподстановкой + чипы */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <TeamCombo key={teamComboKey} teams={sortedTeams.filter(x => !fTeams.includes(x.ID))} valueID=""
                placeholder={`+ группа${allTeams.length ? ` (${allTeams.length})` : ''}`}
                onPick={addTeam} style={{ ...input, cursor: 'text', minWidth: 200 }} />
              {fTeams.map(id => {
                const nm = allTeams.find(x => x.ID === id)?.name || id;
                return (
                  <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: mono, background: 'rgba(79,142,247,0.15)', color: '#4f8ef7', border: '1px solid #4f8ef755', borderRadius: 16, padding: '4px 10px' }}>
                    {nm}<span onClick={() => removeTeam(id)} style={{ cursor: 'pointer', fontWeight: 700 }}>×</span>
                  </span>
                );
              })}
            </div>

            {/* Даты + сохранённые фильтры */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: t.faint, fontFamily: mono }}>создан:</span>
              <input type="date" value={fCreatedFrom} onChange={e => { setFCreatedFrom(e.target.value); setAppliedName(''); load({ cf: e.target.value }); }} style={{ ...input, colorScheme: t.scheme }} />
              <input type="date" value={fCreatedTo} onChange={e => { setFCreatedTo(e.target.value); setAppliedName(''); load({ ct: e.target.value }); }} style={{ ...input, colorScheme: t.scheme }} />
              <span style={{ fontSize: 12, color: t.faint, fontFamily: mono }}>активность:</span>
              <input type="date" value={fActiveFrom} onChange={e => { setFActiveFrom(e.target.value); setAppliedName(''); load({ af: e.target.value }); }} style={{ ...input, colorScheme: t.scheme }} />
              <input type="date" value={fActiveTo} onChange={e => { setFActiveTo(e.target.value); setAppliedName(''); load({ at: e.target.value }); }} style={{ ...input, colorScheme: t.scheme }} />

              <span style={{ width: 1, height: 22, background: t.border, margin: '0 4px' }} />
              <select value={appliedName} onChange={e => applySaved(e.target.value)} style={{ ...input, cursor: 'pointer', maxWidth: 200 }}>
                <option value="">Мои фильтры…</option>
                {saved.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
              <button onClick={saveCurrent} style={{ ...input, cursor: 'pointer' }}>💾 Сохранить</button>
              {appliedName && <button onClick={() => deleteSaved(appliedName)} title="Удалить выбранный фильтр" style={{ ...input, cursor: 'pointer' }}>🗑</button>}
              {(fStatuses.length || fTeams.length || fCreatedFrom || fCreatedTo || fActiveFrom || fActiveTo) ? (
                <button onClick={resetFilters} style={{ ...input, cursor: 'pointer' }}>Сбросить</button>
              ) : null}
              <span style={{ fontSize: 12, color: t.dim, fontFamily: mono, marginLeft: 'auto' }}>{rows.length} тикетов</span>
            </div>
          </div>
        )}

        {err && <div style={{ ...box, padding: 12, marginBottom: 14, borderColor: '#e17055', color: '#e17055', fontSize: 13, fontFamily: mono }}>{err}</div>}
        {notice && <div style={{ ...box, padding: 12, marginBottom: 14, borderColor: '#00a884', color: '#00a884', fontSize: 13, fontFamily: mono }}>{notice}</div>}

        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          {/* ── Список ── */}
          <div style={{ flex: '1 1 420px', minWidth: 340, maxWidth: 560 }}>
            <div style={{ ...box, overflow: 'hidden' }}>
              {filtered.length === 0 && <div style={{ padding: 20, color: t.dim, fontSize: 13 }}>{loading ? 'Загрузка…' : searched ? (rows.length ? 'Под фильтры ничего не подходит.' : 'Ничего не найдено.') : 'Нажмите «Найти», чтобы загрузить тикеты.'}</div>}
              {filtered.map(r => (
                <div key={r.ID} onClick={() => { setSelId(r.ID); setNotice(''); }} style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, cursor: 'pointer', background: selId === r.ID ? t.selected : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: t.faint }}>#{r.shortID || r.ID.slice(0, 6)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject || '(без темы)'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: t.dim, fontFamily: mono }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.requester?.name || '—'} · {r.assignment?.team?.name || 'без команды'}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{fmt(r.lastMessageAt || r.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Деталь ── */}
          <div style={{ flex: '2 1 520px', minWidth: 380 }}>
            {!selected && <div style={{ ...box, padding: 20, color: t.dim, fontSize: 13 }}>Выберите тикет слева.</div>}
            {selected && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 420px', minWidth: 320 }}>
                  <div style={{ ...box, padding: 16, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{selected.subject || '(без темы)'}</div>
                      <StatusBadge status={selected.status} />
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 11, color: t.faint }}>#{selected.shortID} · {fmt(selected.createdAt)}</div>
                  </div>

                  <div style={{ ...box, padding: 16, marginBottom: 14, maxHeight: 520, overflow: 'auto' }}>
                    {(selected.events || []).map((e, i) => {
                      if (e.type === 'message' && e.message?.text != null) {
                        const isClient = e.author?.type === 'client';
                        const priv = e.message.isPrivate;
                        const name = isClient ? (selected.requester?.name || 'Клиент') : (e.author?.name || 'Агент');
                        return (
                          <div key={i} style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: `1px solid ${t.border}`,
                            background: priv ? t.msgPriv : isClient ? t.msgClient : t.msgAgent }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, fontSize: 11, fontFamily: mono, color: t.dim }}>
                              <span style={{ color: priv ? '#c79100' : isClient ? '#7c5cff' : '#4f8ef7', fontWeight: 600 }}>
                                {priv ? '🔒 Приватная заметка · ' : ''}{name.trim()}
                              </span>
                              <span>{fmt(e.date)}</span>
                            </div>
                            <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><Linkified text={e.message.text} /></div>
                          </div>
                        );
                      }
                      const sum = eventSummary(e);
                      if (!sum) return null;
                      return <div key={i} style={{ textAlign: 'center', fontSize: 11, fontFamily: mono, color: t.faint2, margin: '8px 0' }}>{e.author?.name?.trim() || 'система'} · {sum} · {fmt(e.date)}</div>;
                    })}
                  </div>

                  <div style={{ ...box, padding: 14 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      {[['Публичный ответ', false], ['🔒 Приватная заметка', true]].map(([lbl2, val]) => (
                        <button key={String(val)} onClick={() => setReplyPrivate(val as boolean)} style={{ ...input, cursor: 'pointer', padding: '6px 12px', fontSize: 12,
                          background: replyPrivate === val ? (val ? 'rgba(224,168,0,0.15)' : 'rgba(79,142,247,0.15)') : 'transparent',
                          borderColor: replyPrivate === val ? (val ? '#e0a800' : '#4f8ef7') : t.border,
                          color: replyPrivate === val ? (val ? '#c79100' : '#4f8ef7') : t.dim, fontWeight: replyPrivate === val ? 600 : 400 }}>{lbl2 as string}</button>
                      ))}
                    </div>
                    <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder={replyPrivate ? 'Приватная заметка для команды (клиент не увидит)…' : 'Ответ клиенту…'} rows={4} style={{ ...input, width: '100%', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
                    <button onClick={send} disabled={sending || !reply.trim()} style={{ ...input, cursor: 'pointer', background: reply.trim() ? (replyPrivate ? '#c79100' : '#4f8ef7') : t.border, borderColor: 'transparent', color: '#fff', fontWeight: 600 }}>{sending ? 'Отправка…' : replyPrivate ? 'Добавить заметку' : 'Отправить ответ'}</button>
                  </div>
                </div>

                <div style={{ flex: '1 1 240px', minWidth: 220 }}>
                  <div style={{ ...box, padding: 16, marginBottom: 14 }}>
                    <div style={{ marginBottom: 14 }}>
                      <div style={sectionTitle}>Клиент</div>
                      <Field t={t} label="Имя" value={selected.requester?.name || '—'} />
                      {selected.customFields?.user_id && <Field t={t} label="ID" value={selected.customFields.user_id} mono />}
                      <Field t={t} label="Контакт" value={selected.requester?.email || '—'} mono />
                    </div>
                    {/* Теги */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={sectionTitle}>Теги</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {(selected.tagIDs || []).map(tid => (
                          <span key={tid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: mono, background: 'rgba(124,92,255,0.15)', color: '#7c5cff', border: '1px solid #7c5cff55', borderRadius: 14, padding: '3px 9px' }}>
                            {tagName(tid)}<span onClick={() => removeTicketTag(tid)} style={{ cursor: 'pointer', fontWeight: 700 }}>×</span>
                          </span>
                        ))}
                        {!(selected.tagIDs || []).length && <span style={{ fontSize: 12, color: t.faint }}>нет тегов</span>}
                      </div>
                      <TeamCombo key={tagComboKey} teams={allTags.filter(x => !(selected.tagIDs || []).includes(x.ID))} valueID=""
                        placeholder="+ добавить тег" onPick={addTicketTag} style={{ ...input, width: '100%', boxSizing: 'border-box', cursor: 'text' }} />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={sectionTitle}>Назначение</div>
                      <Field t={t} label="Команда" value={selected.assignment?.team?.name || '—'} />
                      <Field t={t} label="Агент" value={selected.assignment?.agent?.name?.trim() || 'не назначен'} />
                    </div>
                    {selected.customFields && Object.keys(selected.customFields).length > 0 && (
                      <div>
                        <div style={sectionTitle}>Доп. поля</div>
                        {Object.entries(selected.customFields).filter(([k]) => k !== 'user_id').map(([k, v]) => <Field key={k} t={t} label={k} value={String(v)} mono />)}
                      </div>
                    )}
                  </div>

                  {requesterTickets.length > 0 && (
                    <div style={{ ...box, padding: 16 }}>
                      <div style={{ ...sectionTitle, marginBottom: 10 }}>Тикеты этого клиента ({requesterTickets.length})</div>
                      {requesterTickets.map(r => (
                        <div key={r.ID} onClick={() => setSelId(r.ID)} style={{ cursor: 'pointer', padding: '8px 0', borderTop: `1px solid ${t.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <StatusBadge status={r.status} />
                          <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject || '(без темы)'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Модалка создания ── */}
      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: t.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...box, padding: 24, width: 460, maxWidth: '90vw' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, fontFamily: mono }}>Новый тикет</div>
            <Lbl t={t}>Тема</Lbl>
            <input value={nf.subject} onChange={e => setNf({ ...nf, subject: e.target.value })} style={{ ...input, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
            <Lbl t={t}>Почта клиента</Lbl>
            <input value={nf.email} onChange={e => setNf({ ...nf, email: e.target.value })} placeholder="client@example.com" style={{ ...input, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
            <Lbl t={t}>Имя клиента (необязательно)</Lbl>
            <input value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} style={{ ...input, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
            <Lbl t={t}>Группа (команда отправки)</Lbl>
            <div style={{ marginBottom: 12 }}>
              <TeamCombo teams={sortedTeams} valueID={nf.teamID} placeholder="Начните вводить название…"
                onPick={id => setNf({ ...nf, teamID: id })} style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <Lbl t={t}>Приоритет</Lbl>
                <select value={nf.priority} onChange={e => setNf({ ...nf, priority: e.target.value })} style={{ ...input, width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}>
                  {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <Lbl t={t}>Статус</Lbl>
                <select value={nf.status} onChange={e => setNf({ ...nf, status: e.target.value })} style={{ ...input, width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}>
                  {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <Lbl t={t}>Сообщение</Lbl>
            <textarea value={nf.text} onChange={e => setNf({ ...nf, text: e.target.value })} rows={4} style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNew(false)} style={{ ...input, cursor: 'pointer' }}>Отмена</button>
              <button onClick={create} disabled={creating} style={{ ...input, cursor: 'pointer', background: '#4f8ef7', borderColor: '#4f8ef7', color: '#fff', fontWeight: 600 }}>{creating ? 'Создание…' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Lbl({ t, children }: { t: Theme; children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 11, color: t.dim, marginBottom: 5, fontFamily: mono }}>{children}</label>;
}

function Field({ t, label, value, mono: m }: { t: Theme; label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, marginBottom: 5 }}>
      <span style={{ color: t.faint, fontFamily: mono, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-word', fontFamily: m ? mono : undefined }}>{value}</span>
    </div>
  );
}
