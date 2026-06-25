import { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/BackButton';
import { listTickets, listTeams, replyTicket, createTicket, type Ticket, type TicketEvent, type Team } from '@/lib/helpdeskApi';

// Все 5 статусов HelpDesk (значения API подтверждены диагностикой; on hold = onhold).
const STATUSES: [string, string][] = [
  ['open', 'Открыт'], ['pending', 'Ожидает'], ['onhold', 'На удержании'], ['solved', 'Решён'], ['closed', 'Закрыт'],
];

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
    case 'tags': return 'изменены теги';
    case 'assignment': return 'изменено назначение';
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

  const [fStatus, setFStatus] = useState('all');
  const [fTeam, setFTeam] = useState('all');
  const [fCreatedFrom, setFCreatedFrom] = useState('');
  const [fCreatedTo, setFCreatedTo] = useState('');
  const [fActiveFrom, setFActiveFrom] = useState('');
  const [fActiveTo, setFActiveTo] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ subject: '', email: '', name: '', text: '' });
  const [creating, setCreating] = useState(false);

  const [allTeams, setAllTeams] = useState<Team[]>([]);
  useEffect(() => { listTeams().then(setAllTeams).catch(() => { /* список групп опционален */ }); }, []);

  // Вся фильтрация серверная — показываем rows как есть.
  const filtered = rows;

  const selected = useMemo(() => rows.find(r => r.ID === selId) || null, [rows, selId]);
  const requesterTickets = useMemo(() => {
    if (!selected?.requester?.email) return [];
    return rows.filter(r => r.requester?.email === selected.requester?.email && r.ID !== selected.ID);
  }, [rows, selected]);

  // Все фильтры применяются на сервере (по всей базе). Любая смена фильтра = запрос.
  // ov позволяет передать новое значение поля, не дожидаясь обновления state.
  async function load(ov: { status?: string; team?: string; cf?: string; ct?: string; af?: string; at?: string } = {}) {
    const status = ov.status ?? fStatus, team = ov.team ?? fTeam;
    setLoading(true); setErr(''); setSearched(true);
    try {
      const data = await listTickets({
        query: query.trim() || undefined,
        status: status !== 'all' ? status : undefined,
        teamID: team !== 'all' ? team : undefined,
        createdFrom: (ov.cf ?? fCreatedFrom) || undefined,
        createdTo: (ov.ct ?? fCreatedTo) || undefined,
        activeFrom: (ov.af ?? fActiveFrom) || undefined,
        activeTo: (ov.at ?? fActiveTo) || undefined,
      });
      setRows(data);
      if (!data.find(r => r.ID === selId)) setSelId('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLoading(false); }
  }
  function search(e?: React.FormEvent) { e?.preventDefault(); return load(); }

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
      });
      setShowNew(false); setNf({ subject: '', email: '', name: '', text: '' });
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
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={fStatus} onChange={e => { setFStatus(e.target.value); load({ status: e.target.value }); }} style={{ ...input, cursor: 'pointer' }}>
              <option value="all">Все статусы</option>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={fTeam} onChange={e => { setFTeam(e.target.value); load({ team: e.target.value }); }} style={{ ...input, cursor: 'pointer', maxWidth: 220 }}>
              <option value="all">Все группы{allTeams.length ? ` (${allTeams.length})` : ''}</option>
              {allTeams.map(tm => <option key={tm.ID} value={tm.ID}>{tm.name}</option>)}
            </select>
            <span style={{ fontSize: 12, color: t.faint, fontFamily: mono }}>создан:</span>
            <input type="date" value={fCreatedFrom} onChange={e => { setFCreatedFrom(e.target.value); load({ cf: e.target.value }); }} style={{ ...input, colorScheme: t.scheme }} />
            <input type="date" value={fCreatedTo} onChange={e => { setFCreatedTo(e.target.value); load({ ct: e.target.value }); }} style={{ ...input, colorScheme: t.scheme }} />
            <span style={{ fontSize: 12, color: t.faint, fontFamily: mono }}>активность:</span>
            <input type="date" value={fActiveFrom} onChange={e => { setFActiveFrom(e.target.value); load({ af: e.target.value }); }} style={{ ...input, colorScheme: t.scheme }} />
            <input type="date" value={fActiveTo} onChange={e => { setFActiveTo(e.target.value); load({ at: e.target.value }); }} style={{ ...input, colorScheme: t.scheme }} />
            {(fStatus !== 'all' || fTeam !== 'all' || fCreatedFrom || fCreatedTo || fActiveFrom || fActiveTo) && (
              <button onClick={() => { setFStatus('all'); setFTeam('all'); setFCreatedFrom(''); setFCreatedTo(''); setFActiveFrom(''); setFActiveTo(''); load({ status: 'all', team: 'all', cf: '', ct: '', af: '', at: '' }); }} style={{ ...input, cursor: 'pointer' }}>Сбросить</button>
            )}
            <span style={{ fontSize: 12, color: t.dim, fontFamily: mono, marginLeft: 'auto' }}>{rows.length} тикетов</span>
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
                      <Field t={t} label="Контакт" value={selected.requester?.email || '—'} mono />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={sectionTitle}>Назначение</div>
                      <Field t={t} label="Команда" value={selected.assignment?.team?.name || '—'} />
                      <Field t={t} label="Агент" value={selected.assignment?.agent?.name?.trim() || 'не назначен'} />
                    </div>
                    {selected.customFields && Object.keys(selected.customFields).length > 0 && (
                      <div>
                        <div style={sectionTitle}>Доп. поля</div>
                        {Object.entries(selected.customFields).map(([k, v]) => <Field key={k} t={t} label={k} value={String(v)} mono />)}
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
