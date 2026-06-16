import React, { useState, useEffect } from 'react';
import type { Override } from '@/lib/scheduleLogic';

interface ProfilePanelProps {
  name: string;
  getEmp: (name: string) => { email: string; position: string; since: string; hours?: number };
  settings: any;
  overrides: Record<string, Override>;
  year: number;
  month: number;
  version: number;
  isAdmin: boolean;
  onSave: (newSettings: any, logEntries: Array<{ action: string; target?: string }>) => Promise<void>;
  onClose: () => void;
}

const ProfilePanel: React.FC<ProfilePanelProps> = ({
  name,
  getEmp,
  settings,
  overrides,
  year,
  month,
  version,
  isAdmin,
  onSave,
  onClose,
}) => {
  const emp = getEmp(name);

  const [email, setEmail] = useState(emp.email);
  const [position, setPosition] = useState(emp.position);
  const [since, setSince] = useState(emp.since);
  const [hours, setHours] = useState<string>(emp.hours != null ? String(emp.hours) : '');
  const [telegram, setTelegram] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const e = getEmp(name);
    setEmail(e.email);
    setPosition(e.position);
    setSince(e.since);
    setHours(e.hours != null ? String(e.hours) : '');
    setTelegram(settings.employeeOverrides?.[name]?.telegram ?? '');
    setError('');
    setSaved(false);
  }, [name, version]);

  const isTlOrAdmin = isAdmin;

  const handleSave = async () => {
    const newEmployeeOverrides = {
      ...(settings.employeeOverrides ?? {}),
      [name]: {
        ...(settings.employeeOverrides?.[name] ?? {}),
        email: isTlOrAdmin ? email.trim() : undefined,
        position: isTlOrAdmin ? position.trim() : undefined,
        since: isTlOrAdmin ? (since || undefined) : undefined,
        hours: isTlOrAdmin && hours !== '' ? Number(hours) : undefined,
        telegram: telegram.trim() || undefined,
      },
    };

    // Remove undefined keys
    const cleaned = Object.fromEntries(
      Object.entries(newEmployeeOverrides[name]).filter(([, v]) => v !== undefined)
    );
    newEmployeeOverrides[name] = cleaned;

    const newSettings = { ...settings, employeeOverrides: newEmployeeOverrides };

    setSaving(true);
    setError('');
    try {
      await onSave(newSettings, [{ action: 'edit_profile', target: name }]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>Профиль: {name}</strong>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      <div className="form-field">
        <label className="form-label">Telegram</label>
        <input className="form-input" type="text" value={telegram} onChange={e => setTelegram(e.target.value)} placeholder="@username" />
      </div>

      {isTlOrAdmin && (
        <>
          <div className="form-field">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Позиция</label>
            <input className="form-input" type="text" value={position} onChange={e => setPosition(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">С даты</label>
            <input className="form-input" type="date" value={since} onChange={e => setSince(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Часов в смену</label>
            <input className="form-input" type="number" min={1} max={24} value={hours} onChange={e => setHours(e.target.value)} placeholder="По умолчанию (11)" />
          </div>
        </>
      )}

      {error && <div className="save-msg err">{error}</div>}
      {saved && <div className="save-msg ok">Сохранено</div>}

      <div className="btn-row">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
};

export default React.memo(ProfilePanel);
