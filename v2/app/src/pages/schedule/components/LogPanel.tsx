import React from 'react';
import type { LogEntry } from '@/lib/scheduleApi';

interface LogPanelProps {
  log: LogEntry[];
}

function fmtTime(at: string): string {
  if (!at) return '';
  const d = new Date(at);
  if (isNaN(d.getTime())) return at;
  return d.toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function authorName(by: string): string {
  if (!by) return '—';
  return by.split('@')[0];
}

const LogPanel: React.FC<LogPanelProps> = ({ log }) => {
  if (!log.length) {
    return (
      <div className="log-panel">
        <div className="log-panel-title">История изменений</div>
        <div className="log-entry" style={{ color: 'var(--c-muted)' }}>Пока нет записей</div>
      </div>
    );
  }

  // Новые записи сверху.
  const entries = [...log].reverse();

  return (
    <div className="log-panel">
      <div className="log-panel-title">История изменений</div>
      <ul className="log-list">
        {entries.map((entry, i) => (
          <li key={i} className="log-entry">
            <span className="log-time">{fmtTime(entry.at)}</span>
            <span className="log-action">{entry.action}</span>
            {entry.target && <span className="log-target">{entry.target}</span>}
            <span className="log-by">· {authorName(entry.by)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default React.memo(LogPanel);
