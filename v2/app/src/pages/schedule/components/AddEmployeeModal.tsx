import React, { useState, useEffect } from 'react';
import type { SectionDef } from '@/lib/useScheduleState';
import type { Override } from '@/lib/scheduleLogic';

interface AddEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  sections: SectionDef[];
  existingNames: string[];
  settings: any;
  overrides: Record<string, Override>;
  year: number;
  month: number;
  version: number;
  onSave: (newSettings: any, logEntries: Array<{ action: string; target?: string }>) => Promise<void>;
}

const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  open,
  onClose,
  sections,
  existingNames,
  settings,
  overrides: _overrides,
  year: _year,
  month: _month,
  version: _version,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('Support');
  const [since, setSince] = useState('');
  const [section, setSection] = useState(sections[0]?.key ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setPosition('Support');
    setSince('');
    setSection(sections[0]?.key ?? '');
    setError('');
  }, [open, sections]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Введите имя'); return; }
    if (existingNames.includes(trimmedName)) { setError('Сотрудник с таким именем уже существует'); return; }
    if (!section) { setError('Выберите секцию'); return; }

    const newEmployeeOverrides = {
      ...(settings.employeeOverrides ?? {}),
      [trimmedName]: { email: email.trim(), position: position.trim(), since: since || undefined },
    };
    // Добавляем имя в customOrder выбранной секции — именно его читает useScheduleState
    // (как в v1). Раньше писали в settings.people, который нигде не читается → сотрудник
    // сохранялся, но не появлялся ни в одной секции.
    // Берём «сырой» (глобальный, нефильтрованный) порядок, чтобы не потерять
    // других убранных операторов секции; дубликат не создаём.
    const sec = sections.find(s => s.key === section);
    const rawOrder: string[] = settings.customOrder?.[section] ?? (sec ? sec.members : []);
    const nextOrder = rawOrder.includes(trimmedName) ? rawOrder : [...rawOrder, trimmedName];
    const newCustomOrder = {
      ...(settings.customOrder ?? {}),
      [section]: nextOrder,
    };
    // Если оператора ранее убирали из графика — снимаем метку, он снова виден.
    const newRemovedFrom = { ...(settings.removedFrom ?? {}) };
    delete newRemovedFrom[trimmedName];
    const newSettings = {
      ...settings,
      employeeOverrides: newEmployeeOverrides,
      customOrder: newCustomOrder,
      removedFrom: newRemovedFrom,
    };

    setSaving(true);
    setError('');
    try {
      await onSave(newSettings, [{ action: 'add_employee', target: trimmedName }]);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-title">
          Добавить сотрудника
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-field">
          <label className="form-label">Имя *</label>
          <input className="form-input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Полное имя" />
        </div>

        <div className="form-field">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>

        <div className="form-field">
          <label className="form-label">Позиция</label>
          <input className="form-input" type="text" value={position} onChange={e => setPosition(e.target.value)} placeholder="Support" />
        </div>

        <div className="form-field">
          <label className="form-label">Дата начала</label>
          <input className="form-input" type="date" value={since} onChange={e => setSince(e.target.value)} />
        </div>

        <div className="form-field">
          <label className="form-label">Секция *</label>
          <select className="form-select" value={section} onChange={e => setSection(e.target.value)}>
            {sections.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        {error && <div className="save-msg err">{error}</div>}

        <div className="btn-row">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddEmployeeModal;
