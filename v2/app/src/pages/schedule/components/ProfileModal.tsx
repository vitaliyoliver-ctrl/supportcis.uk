import React, { useState, useEffect } from 'react';
import type { ScheduleSettings } from '@/lib/scheduleApi';

interface ProfileModalProps {
  open: boolean;
  name: string | null;
  onClose: () => void;
  getEmp: (name: string) => { email: string; position: string; since: string; hours?: number };
  settings: ScheduleSettings;
  onSave: (newSettings: ScheduleSettings, logEntries: Array<{ action: string; target?: string }>) => Promise<void>;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ open, name, onClose, getEmp, settings, onSave }) => {
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [since, setSince] = useState('');
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !name) return;
    const emp = getEmp(name);
    setEmail(emp.email ?? '');
    setPosition(emp.position ?? '');
    setSince(emp.since ?? '');
    setHours(emp.hours != null ? String(emp.hours) : '');
    setError('');
  }, [open, name]);

  if (!open || !name) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const ovr = { ...(settings.employeeOverrides ?? {}) };
      ovr[name] = {
        ...(ovr[name] ?? {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(position.trim() ? { position: position.trim() } : {}),
        ...(since.trim() ? { since: since.trim() } : {}),
        ...(hours !== '' ? { hours: Number(hours) } : {}),
      };
      await onSave({ ...settings, employeeOverrides: ovr }, [{ action: 'profile_update', target: name }]);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel profile-modal-panel">
        <div className="modal-title">
          Профиль: {name}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-field">
          <label className="form-label">Email</label>
          <input className="form-input" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label">Должность</label>
          <input className="form-input" value={position} onChange={e => setPosition(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-field">
            <label className="form-label">Дата найма</label>
            <input className="form-input" type="date" value={since} onChange={e => setSince(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Часов/мес</label>
            <input className="form-input" type="number" value={hours} onChange={e => setHours(e.target.value)} style={{ maxWidth: 90 }} />
          </div>
        </div>

        {error && <div className="save-msg err">{error}</div>}

        <div className="btn-row">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
