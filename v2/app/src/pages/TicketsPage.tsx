import { useMemo, useState } from 'react';
import BackButton from '@/components/BackButton';
import { listTickets, replyTicket, createTicket, type Ticket, type TicketEvent } from '@/lib/helpdeskApi';

// Своя тикет-система поверх HelpDesk: список, поиск, детальный тикет с перепиской,
// инфо-панель, тикеты пользователя, ответ и создание. Почты замаскированы на бэке.

const mono = "'JetBrains Mono', monospace";

const STATUS_COLOR: Record<string, string> = {
  open: '#4f8ef7', pending: '#fdcb6e', solved: '#00b894', closed: '#8b8a9e',
};
function statusColor(s?: string) { return STATUS_COLOR[(s || '').toLowerCase()] || '#8b8a9e'; }

function fmt(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Превращает URL в кликабельные ссылки, остальное — как текст с переносами.
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <>{parts.map((p, i) => /^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: '#4f8ef7', wordBreak: 'break-all' }}>ссылка ↗</a>
    : <span key={i}>{p}</span>)}</>;
}

// Краткое описание системного события (смена статуса, теги, назначение и т.п.).
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

const box: React.CSSProperties = { background: '#161922', border: '1px solid #2a2e3d', borderRadius: 10 };
const input: React.CSSProperties = { background: '#1a1d27', border: '1px solid #2a2e3d', color: '#e8e6f0', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontFamily: mono };

function StatusBadge({ status }: { status?: string }) {
  const c = statusColor(status);
  return <span style={{ fontSize: 11, fontFamily: mono, color: c, border: `1px solid ${c}55`, background: `${c}18`, padding: '2px 8px', borderRadius: 20 }}>{status || '—'}</span>;
}

export default function TicketsPage() {
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

  // Фильтры (по загруженным тикетам)
  const [fStatus, setFStatus] = useState('all');
  const [fTeam, setFTeam] = useState('all');
  const [fCreatedFrom, setFCreatedFrom] = useState('');
  const [fCreatedTo, setFCreatedTo] = useState('');
  const [fActiveFrom, setFActiveFrom] = useState('');
  const [fActiveTo, setFActiveTo] = useState('');

  // Создание тикета
  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ subject: '', email: '', name: '', text: '' });
  const [creating, setCreating] = useState(false);

  const teams = useMemo(() => [...new Set(rows.map(r => r.assignment?.team?.name).filter(Boolean) as string[])].sort(), [rows]);
  const statuses = useMemo(() => [...new Set(rows.map(r => r.status).filter(Boolean) as string[])].sort(), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (fStatus !== 'all' && r.status !== fStatus) return false;
    if (fTeam !== 'all' && r.assignment?.team?.name !== fTeam) return false;
    const created = (r.createdAt || '').slice(0, 10);
    if (fCreatedFrom && created < fCreatedFrom) return false;
    if (fCreatedTo && created > fCreatedTo) return false;
    const active = (r.lastMessageAt || r.createdAt || '').slice(0, 10);
    if (fActiveFrom && active < fActiveFrom) return false;
    if (fActiveTo && active > fActiveTo) return false;
    return true;
  }), [rows, fStatus, fTeam, fCreatedFrom, fCreatedTo, fActiveFrom, fActiveTo]);

  const selected = useMemo(() => rows.find(r => r.ID === selId) || null, [rows, selId]);
  const requesterTickets = useMemo(() => {
    if (!selected?.requester?.email) return [];
    return rows.filter(r => r.requester?.email === selected.requester?.email && r.ID !== selected.ID);
  }, [rows, selected]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true); setErr(''); setSearched(true);
    try {
      const data = await listTickets({ query: query.trim() || undefined });
      setRows(data);
      if (!data.find(r => r.ID === selId)) setSelId('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLoading(false); }
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
      });
      setShowNew(false); setNf({ subject: '', email: '', name: '', text: '' });
      setNotice('Тикет создан'); await search();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка создания'); }
    finally { setCreating(false); }
  }

  return (
    <div style={{ background: '#0f1117', color: '#e8e6f0', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ background: 'linear-gradient(135deg,#1a1d27,#0f1117)', borderBottom: '1px solid #2a2e3d', padding: '20px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <BackButton to="/support" inline />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f8ef7', boxShadow: '0 0 12px #4f8ef7' }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, fontFamily: mono, letterSpacing: '-0.02em' }}>Тикеты</h1>
          <button onClick={() => { setShowNew(true); setErr(''); }} style={{ ...input, marginLeft: 'auto', cursor: 'pointer', background: '#4f8ef7', borderColor: '#4f8ef7', color: '#fff', fontWeight: 600 }}>+ Новый тикет</button>
        </div>
        <p style={{ marginLeft: 20, fontSize: 12, color: '#8b8a9e' }}>Поиск и ответы · адреса клиентов замаскированы</p>
      </div>

      <div style={{ padding: '20px 28px' }}>
        <form onSubmit={search} style={{ display: 'flex', gap: 10, marginBottom: 16, maxWidth: 720 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по тикетам (тема, текст, № тикета)…" style={{ ...input, flex: 1 }} />
          <button type="submit" disabled={loading} style={{ ...input, cursor: 'pointer', background: '#4f8ef7', borderColor: '#4f8ef7', color: '#fff', fontWeight: 600 }}>{loading ? '…' : 'Найти'}</button>
        </form>

        {/* Фильтры по загруженным тикетам */}
        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="all">Все статусы</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={fTeam} onChange={e => setFTeam(e.target.value)} style={{ ...input, cursor: 'pointer', maxWidth: 200 }}>
              <option value="all">Все группы</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span style={{ fontSize: 12, color: '#6b7280', fontFamily: mono }}>создан:</span>
            <input type="date" value={fCreatedFrom} onChange={e => setFCreatedFrom(e.target.value)} style={{ ...input, colorScheme: 'dark' }} />
            <input type="date" value={fCreatedTo} onChange={e => setFCreatedTo(e.target.value)} style={{ ...input, colorScheme: 'dark' }} />
            <span style={{ fontSize: 12, color: '#6b7280', fontFamily: mono }}>активность:</span>
            <input type="date" value={fActiveFrom} onChange={e => setFActiveFrom(e.target.value)} style={{ ...input, colorScheme: 'dark' }} />
            <input type="date" value={fActiveTo} onChange={e => setFActiveTo(e.target.value)} style={{ ...input, colorScheme: 'dark' }} />
            {(fStatus !== 'all' || fTeam !== 'all' || fCreatedFrom || fCreatedTo || fActiveFrom || fActiveTo) && (
              <button onClick={() => { setFStatus('all'); setFTeam('all'); setFCreatedFrom(''); setFCreatedTo(''); setFActiveFrom(''); setFActiveTo(''); }} style={{ ...input, cursor: 'pointer' }}>Сбросить</button>
            )}
            <span style={{ fontSize: 12, color: '#8b8a9e', fontFamily: mono, marginLeft: 'auto' }}>{filtered.length} из {rows.length}</span>
          </div>
        )}

        {err && <div style={{ ...box, padding: 12, marginBottom: 14, borderColor: '#e17055', color: '#e17055', fontSize: 13, fontFamily: mono }}>{err}</div>}
        {notice && <div style={{ ...box, padding: 12, marginBottom: 14, borderColor: '#00b894', color: '#00b894', fontSize: 13, fontFamily: mono }}>{notice}</div>}

        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          {/* ── Список ── */}
          <div style={{ flex: '1 1 420px', minWidth: 340, maxWidth: 560 }}>
            <div style={{ ...box, overflow: 'hidden' }}>
              {filtered.length === 0 && <div style={{ padding: 20, color: '#8b8a9e', fontSize: 13 }}>{loading ? 'Загрузка…' : searched ? (rows.length ? 'Под фильтры ничего не подходит.' : 'Ничего не найдено.') : 'Нажмите «Найти», чтобы загрузить тикеты.'}</div>}
              {filtered.map(r => (
                <div key={r.ID} onClick={() => { setSelId(r.ID); setNotice(''); }} style={{ padding: '12px 16px', borderBottom: '1px solid #2a2e3d', cursor: 'pointer', background: selId === r.ID ? 'rgba(79,142,247,0.10)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: '#6b7280' }}>#{r.shortID || r.ID.slice(0, 6)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject || '(без темы)'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#8b8a9e', fontFamily: mono }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.requester?.name || '—'} · {r.assignment?.team?.name || 'без команды'}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{fmt(r.lastMessageAt || r.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Деталь ── */}
          <div style={{ flex: '2 1 520px', minWidth: 380 }}>
            {!selected && <div style={{ ...box, padding: 20, color: '#8b8a9e', fontSize: 13 }}>Выберите тикет слева.</div>}
            {selected && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Лента + ответ */}
                <div style={{ flex: '2 1 420px', minWidth: 320 }}>
                  <div style={{ ...box, padding: 16, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{selected.subject || '(без темы)'}</div>
                      <StatusBadge status={selected.status} />
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 11, color: '#6b7280' }}>#{selected.shortID} · {fmt(selected.createdAt)}</div>
                  </div>

                  <div style={{ ...box, padding: 16, marginBottom: 14, maxHeight: 520, overflow: 'auto' }}>
                    {(selected.events || []).map((e, i) => {
                      if (e.type === 'message' && e.message?.text != null) {
                        const isClient = e.author?.type === 'client';
                        const priv = e.message.isPrivate;
                        const name = isClient ? (selected.requester?.name || 'Клиент') : (e.author?.name || 'Агент');
                        return (
                          <div key={i} style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid #2a2e3d',
                            background: priv ? '#0f1117' : isClient ? 'rgba(255,255,255,0.03)' : 'rgba(79,142,247,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, fontSize: 11, fontFamily: mono, color: '#8b8a9e' }}>
                              <span style={{ color: priv ? '#fdcb6e' : isClient ? '#a29bfe' : '#4f8ef7', fontWeight: 600 }}>
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
                      return <div key={i} style={{ textAlign: 'center', fontSize: 11, fontFamily: mono, color: '#5a5970', margin: '8px 0' }}>{e.author?.name?.trim() || 'система'} · {sum} · {fmt(e.date)}</div>;
                    })}
                  </div>

                  <div style={{ ...box, padding: 14 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      {[['Публичный ответ', false], ['🔒 Приватная заметка', true]].map(([lbl2, val]) => (
                        <button key={String(val)} onClick={() => setReplyPrivate(val as boolean)} style={{ ...input, cursor: 'pointer', padding: '6px 12px', fontSize: 12,
                          background: replyPrivate === val ? (val ? 'rgba(253,203,110,0.15)' : 'rgba(79,142,247,0.15)') : 'transparent',
                          borderColor: replyPrivate === val ? (val ? '#fdcb6e' : '#4f8ef7') : '#2a2e3d',
                          color: replyPrivate === val ? (val ? '#fdcb6e' : '#4f8ef7') : '#8b8a9e', fontWeight: replyPrivate === val ? 600 : 400 }}>{lbl2 as string}</button>
                      ))}
                    </div>
                    <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder={replyPrivate ? 'Приватная заметка для команды (клиент не увидит)…' : 'Ответ клиенту…'} rows={4} style={{ ...input, width: '100%', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
                    <button onClick={send} disabled={sending || !reply.trim()} style={{ ...input, cursor: 'pointer', background: reply.trim() ? (replyPrivate ? '#b8860b' : '#4f8ef7') : '#2a2e3d', borderColor: 'transparent', color: '#fff', fontWeight: 600 }}>{sending ? 'Отправка…' : replyPrivate ? 'Добавить заметку' : 'Отправить ответ'}</button>
                  </div>
                </div>

                {/* Инфо-панель */}
                <div style={{ flex: '1 1 240px', minWidth: 220 }}>
                  <div style={{ ...box, padding: 16, marginBottom: 14 }}>
                    <Section title="Клиент">
                      <Field label="Имя" value={selected.requester?.name || '—'} />
                      <Field label="Контакт" value={selected.requester?.email || '—'} mono />
                    </Section>
                    <Section title="Назначение">
                      <Field label="Команда" value={selected.assignment?.team?.name || '—'} />
                      <Field label="Агент" value={selected.assignment?.agent?.name?.trim() || 'не назначен'} />
                    </Section>
                    {selected.customFields && Object.keys(selected.customFields).length > 0 && (
                      <Section title="Доп. поля">
                        {Object.entries(selected.customFields).map(([k, v]) => <Field key={k} label={k} value={String(v)} mono />)}
                      </Section>
                    )}
                  </div>

                  {requesterTickets.length > 0 && (
                    <div style={{ ...box, padding: 16 }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8b8a9e', marginBottom: 10, fontFamily: mono }}>Тикеты этого клиента ({requesterTickets.length})</div>
                      {requesterTickets.map(r => (
                        <div key={r.ID} onClick={() => setSelId(r.ID)} style={{ cursor: 'pointer', padding: '8px 0', borderTop: '1px solid #2a2e3d', display: 'flex', gap: 8, alignItems: 'center' }}>
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
        <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...box, padding: 24, width: 460, maxWidth: '90vw' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, fontFamily: mono }}>Новый тикет</div>
            <label style={lbl}>Тема</label>
            <input value={nf.subject} onChange={e => setNf({ ...nf, subject: e.target.value })} style={{ ...input, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
            <label style={lbl}>Почта клиента</label>
            <input value={nf.email} onChange={e => setNf({ ...nf, email: e.target.value })} placeholder="client@example.com" style={{ ...input, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
            <label style={lbl}>Имя клиента (необязательно)</label>
            <input value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} style={{ ...input, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
            <label style={lbl}>Сообщение</label>
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

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: '#8b8a9e', marginBottom: 5, fontFamily: mono };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8b8a9e', marginBottom: 8, fontFamily: mono }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, mono: m }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, marginBottom: 5 }}>
      <span style={{ color: '#6b7280', fontFamily: mono, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-word', fontFamily: m ? mono : undefined }}>{value}</span>
    </div>
  );
}
