import { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/BackButton';
import { getAudit, type AuditEntry } from '@/lib/helpdeskApi';

// Журнал действий операторов в тикет-системе HelpDesk (только TL).
// Помогает заметить аномалии — например массовый перебор тикетов.

const mono = "'JetBrains Mono', monospace";
const ACTION_LABEL: Record<string, string> = { list: 'Поиск', view: 'Просмотр', reply: 'Ответ' };
const ACTION_COLOR: Record<string, string> = { list: '#a29bfe', view: '#4f8ef7', reply: '#00b894' };

export default function TLHelpdeskAuditPage() {
  const [log, setLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [who, setWho] = useState('all');
  const [action, setAction] = useState('all');

  useEffect(() => {
    getAudit().then(setLog).catch(e => setErr(e instanceof Error ? e.message : 'Ошибка')).finally(() => setLoading(false));
  }, []);

  const operators = useMemo(() => [...new Set(log.map(e => e.by))].sort(), [log]);
  const rows = useMemo(() => log.filter(e =>
    (who === 'all' || e.by === who) && (action === 'all' || e.action === action),
  ), [log, who, action]);

  // Сводка по операторам — кто сколько действий совершил.
  const summary = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of rows) m[e.by] = (m[e.by] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const sel: React.CSSProperties = { background: '#1a1d27', border: '1px solid #2a2e3d', color: '#e8e6f0', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: mono, cursor: 'pointer' };
  const td: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #2a2e3d', fontFamily: mono, fontSize: 13 };
  const th: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', color: '#8b8a9e', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2a2e3d', fontFamily: mono };

  return (
    <div style={{ background: '#0f1117', color: '#e8e6f0', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ background: 'linear-gradient(135deg,#1a1d27,#0f1117)', borderBottom: '1px solid #2a2e3d', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <BackButton to="/tl" inline />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6c5ce7', boxShadow: '0 0 12px #6c5ce7' }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, letterSpacing: '-0.02em' }}>Аудит тикетов</h1>
        </div>
        <p style={{ marginLeft: 20, fontSize: 13, color: '#8b8a9e' }}>Действия операторов в HelpDesk · последние 500 записей · хранится 90 дней</p>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
        {err && <div style={{ padding: 14, marginBottom: 16, border: '1px solid #e17055', borderRadius: 10, color: '#e17055', fontSize: 13, fontFamily: mono }}>{err}</div>}
        {loading && <div style={{ color: '#8b8a9e', fontSize: 13 }}>Загрузка…</div>}

        {!loading && !err && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <select value={who} onChange={e => setWho(e.target.value)} style={sel}>
                <option value="all">Все операторы</option>
                {operators.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={action} onChange={e => setAction(e.target.value)} style={sel}>
                <option value="all">Все действия</option>
                {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 13, color: '#8b8a9e', fontFamily: mono }}>{rows.length} записей</div>
            </div>

            {summary.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                {summary.slice(0, 8).map(([op, n]) => (
                  <div key={op} style={{ background: '#161922', border: '1px solid #2a2e3d', borderRadius: 10, padding: '10px 14px', fontFamily: mono, fontSize: 12 }}>
                    <span style={{ color: '#8b8a9e' }}>{op}</span> · <span style={{ color: '#e8e6f0', fontWeight: 600 }}>{n}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #2a2e3d', borderRadius: 10, background: '#161922' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Время</th><th style={th}>Оператор</th><th style={th}>Действие</th><th style={th}>Детали</th></tr></thead>
                <tbody>
                  {rows.map((e, i) => (
                    <tr key={i}>
                      <td style={{ ...td, color: '#8b8a9e', whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString('ru-RU')}</td>
                      <td style={td}>{e.by}</td>
                      <td style={{ ...td, color: ACTION_COLOR[e.action] || '#e8e6f0', fontWeight: 600 }}>{ACTION_LABEL[e.action] || e.action}</td>
                      <td style={{ ...td, color: '#cbd5e1' }}>{e.detail}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={4} style={{ ...td, color: '#8b8a9e' }}>Нет записей.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
