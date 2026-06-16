import React from 'react';

interface LogEntry {
  action: string;
  target?: string | null;
}

interface LogPanelProps {
  log: LogEntry[];
}

const LogPanel: React.FC<LogPanelProps> = ({ log }) => {
  if (!log.length) return null;

  return (
    <div className="log-panel">
      <div className="log-panel-title">Лог изменений</div>
      <ul className="log-list">
        {log.map((entry, i) => (
          <li key={i} className="log-entry">
            <span className="log-action">{entry.action}</span>
            {entry.target && <span className="log-target"> — {entry.target}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default React.memo(LogPanel);
