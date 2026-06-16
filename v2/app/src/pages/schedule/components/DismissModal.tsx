import React, { useState, useEffect, useMemo } from 'react';
import type { SectionDef } from '@/lib/useScheduleState';
import type { Override } from '@/lib/scheduleLogic';

interface DismissModalProps {
  open: boolean;
  onClose: () => void;
  sections: SectionDef[];
  dismissedEmployees: Record<string, string>;
  overrides: Record<string, Override>;
  settings: any;
  year: number;
  month: number;
  version: number;
  onSave: (
    newOverrides: Record<string, Override>,
    newSettings: any,
    logEntries: Array<{ action: string; target?: string }>
  ) => Promise<void>;
}

const DismissModal: React.FC<DismissModalProps> = ({
  open,
  onClose,
  sections,
  dismissedEmployees,
  overrides,
  settings,
  year,
  month,
  version,
  onSave,
}) => {
  const allMembers = useMemo(() => sections.flatMap(s => s.members), [sections]);
  const activeMembers = useMemo(
    () => allMembers.filter(name => !dismissedEmployees[name]),
    [allMembers, dismissedEmployees]
  );

  const [selectedName, setSelectedName] = useState<string>('');
  const [lastDay, setLastDay] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedName(activeMembers[0] ?? '');
    setLastDay('');
    setError('');
  }, [open, activeMembers]);

  const handleSave = async () => {
    if (!selectedName) { setError('Выберите сотрудника'); return; }
    if (!lastDay) { setError('Укажите последний рабочий день'); return; }

    // Remove overrides after lastDay
    const newOverrides: Record<string, Override> = {};
    for (const [key, ovr] of Object.entries(overrides)) {
      const parts = key.split(':');
      if (parts.length >= 2) {
        const name = parts.slice(0, -1).join(':');
        const ds = parts[parts.length - 1];
        if (name === selectedName && ds > lastDay) continue;
      }
      newOverrides[key] = ovr;
    }

    const newDismissed = { ...(settings.dismissed ?? {}), [selectedName]: lastDay };
    const newSettings = { ...settings, dismissed: newDismissed };

    setSaving(true);
    setError('');
    try {
      await onSave(newOverrides, newSettings, [{ action: 'dismiss', target: selectedName }]);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-title">
          Уволить сотрудника
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-field">
          <label className="form-label">Сотрудник</label>
          <select className="form-select" value={selectedName} onChange={e => setSelectedName(e.target.value)}>
            <option value="">— выберите —</option>
            {activeMembers.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div className="form-field">
          <label className="form-label">Последний рабочий день</label>
          <input className="form-input" type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} />
        </div>

        {error && <div className="save-msg err">{error}</div>}

        <div className="btn-row">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-danger" onClick={handleSave} disabled={saving || !selectedName}>
            {saving ? 'Сохранение...' : 'Уволить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DismissModal;
