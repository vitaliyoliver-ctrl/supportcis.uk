import { useState } from 'react';
import BackButton from '@/components/BackButton';
import { listTickets, getTicket, replyTicket } from '@/lib/helpdeskApi';

// Своя тикет-система поверх HelpDesk: поиск + ответ, с маскированными почтами.
// Бэкенд (/api/helpdesk/*) вычищает адреса, фронт лишь отображает результат.

const mono = "'JetBrains Mono', monospace";

// HelpDesk может вернуть тикеты под разными ключами — достаём типовые поля
// мягко, не падая на нестандартной форме.
type Rec = Record<string, unknown>;
function asArray(data: unknown): Rec[] {
  if (Array.isArray(data)) return data as Rec[];
  const d = (data || {}) as Rec;
  for (const k of ['tickets', 'records', 'items', 'data', 'results']) {
    if (Array.isArray(d[k])) return d[k] as Rec[];
  }
  return [];
}
function pick(r: Rec, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object') {
      const inner = pick(v as Rec, keys);
      if (inner) return inner;
    }
  }
  return '';
}

const box: React.CSSProperties = { background: '#161922', border: '1px solid #2a2e3d', borderRadius: 10 };
const input: React.CSSProperties = { background: '#1a1d27', border: '1px solid #2a2e3d', color: '#e8e6f0', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontFamily: mono };

export default function TicketsPage() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState<unknown>(null);
  const [selId, setSelId] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true); setErr(''); setSelected(null);
    try {
      const data = await listTickets({ query: query.trim() || undefined });
      setRows(asArray(data));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLoading(false); }
  }

  async function open(id: string) {
    if (!id) return;
    setSelId(id); setSelected(null); setErr(''); setNotice('');
    try { setSelected(await getTicket(id)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
  }

  async function send() {
    if (!reply.trim() || !selId) return;
    setSending(true); setErr(''); setNotice('');
    try {
      await replyTicket(selId, reply.trim());
      setReply(''); setNotice('Ответ отправлен');
      setSelected(await getTicket(selId));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка отправки'); }
    finally { setSending(false); }
  }

  return (
    <div style={{ background: '#0f1117', color: '#e8e6f0', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ background: 'linear-gradient(135deg,#1a1d27,#0f1117)', borderBottom: '1px solid #2a2e3d', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <BackButton to="/support" inline />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f8ef7', boxShadow: '0 0 12px #4f8ef7' }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, letterSpacing: '-0.02em' }}>Тикеты</h1>
        </div>
        <p style={{ marginLeft: 20, fontSize: 13, color: '#8b8a9e' }}>Поиск и ответы · адреса клиентов замаскированы</p>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <form onSubmit={search} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по тикетам (тема, текст, № тикета)…" style={{ ...input, flex: 1 }} />
          <button type="submit" disabled={loading} style={{ ...input, cursor: 'pointer', background: '#4f8ef7', borderColor: '#4f8ef7', color: '#fff', fontWeight: 600 }}>{loading ? '…' : 'Найти'}</button>
        </form>

        {err && <div style={{ ...box, padding: 14, marginBottom: 16, borderColor: '#e17055', color: '#e17055', fontSize: 13, fontFamily: mono }}>{err}</div>}

        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Список */}
          <div style={{ flex: '1 1 360px', minWidth: 320 }}>
            <div style={{ ...box, overflow: 'hidden' }}>
              {rows.length === 0 && <div style={{ padding: 20, color: '#8b8a9e', fontSize: 13 }}>{loading ? 'Загрузка…' : 'Ничего не найдено. Запустите поиск.'}</div>}
              {rows.map((r, i) => {
                const id = pick(r, ['id', 'ticketId', 'number', 'ticketID']);
                const subj = pick(r, ['subject', 'title', 'name']) || '(без темы)';
                const who = pick(r, ['requester', 'from', 'email', 'contact', 'author']) || '—';
                const status = pick(r, ['status', 'state']);
                return (
                  <div key={id || i} onClick={() => open(id)} style={{ padding: '12px 16px', borderBottom: '1px solid #2a2e3d', cursor: 'pointer', background: selId === id ? 'rgba(79,142,247,0.08)' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: mono, fontSize: 12, color: '#8b8a9e' }}>
                      <span>#{id}</span>{status && <span>{status}</span>}
                    </div>
                    <div style={{ fontSize: 14, margin: '4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subj}</div>
                    <div style={{ fontSize: 12, color: '#8b8a9e', fontFamily: mono }}>{who}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Деталь + ответ */}
          <div style={{ flex: '2 1 480px', minWidth: 360 }}>
            {!selId && <div style={{ ...box, padding: 20, color: '#8b8a9e', fontSize: 13 }}>Выберите тикет слева.</div>}
            {selId && (
              <div style={{ ...box, padding: 20 }}>
                <div style={{ fontFamily: mono, fontSize: 13, color: '#8b8a9e', marginBottom: 12 }}>Тикет #{selId}</div>
                {notice && <div style={{ marginBottom: 12, color: '#00b894', fontSize: 13, fontFamily: mono }}>{notice}</div>}
                {!selected && !err && <div style={{ color: '#8b8a9e', fontSize: 13 }}>Загрузка…</div>}
                {selected != null && (
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: mono, color: '#cbd5e1', maxHeight: 360, overflow: 'auto', margin: '0 0 16px', background: '#0f1117', padding: 14, borderRadius: 8, border: '1px solid #2a2e3d' }}>
                    {JSON.stringify(selected, null, 2)}
                  </pre>
                )}
                <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Ответ клиенту…" rows={4} style={{ ...input, width: '100%', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
                <button onClick={send} disabled={sending || !reply.trim()} style={{ ...input, cursor: 'pointer', background: reply.trim() ? '#4f8ef7' : '#2a2e3d', borderColor: 'transparent', color: '#fff', fontWeight: 600 }}>{sending ? 'Отправка…' : 'Отправить ответ'}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
