import React, { useState, useEffect, useCallback } from 'react';
import type { SectionDef } from '@/lib/useScheduleState';
import type { Override, ExtraEvent } from '@/lib/scheduleLogic';
import { dateStr } from '@/lib/scheduleLogic';
import { SHIFT_TYPES_ALL, EXTRA_PLUS_TYPES, EXTRA_MINUS_TYPES } from '@/lib/shiftDefs';

interface ShiftEditorModalProps {
  open: boolean;
  onClose: () => void;
  initialOperator?: string;
  initialDate?: string;
  sections: SectionDef[];
  year: number;
  month: number;
  days: Array<{ d: number; date: Date }>;
  overrides: Record<string, Override>;
  dismissedEmployees: Record<string, string>;
  getShiftForCell: (name: string, di: number) => string;
  getEmp: (name: string) => { email: string; position: string; since: string; hours?: number; dismissed?: string };
  currentUser: { email: string; role: string } | null;
  isAdmin: boolean;
  onSave: (newOverrides: Record<string, Override>, logEntries: Array<{ action: string; target?: string }>) => Promise<void>;
  onOpenProfile: (name: string) => void;
  onOpenPattern: (name: string) => void;
  onOpenDismiss: () => void;
  onRestoreDismissed: (name: string) => void;
}

const ALL_GROUPS = ['Regular', 'VIP', 'Sup', 'Mgmt', null] as const;
type GroupLabel = typeof ALL_GROUPS[number];

const groupLabel = (g: GroupLabel): string => {
  if (g === 'Regular') return 'Regular Support';
  if (g === 'VIP') return 'VIP Support';
  if (g === 'Sup') return 'Supervisors';
  if (g === 'Mgmt') return 'Management';
  return 'Другое';
};

const ShiftEditorModal: React.FC<ShiftEditorModalProps> = ({
  open,
  onClose,
  initialOperator,
  initialDate,
  sections,
  year,
  month,
  days,
  overrides,
  dismissedEmployees,
  getShiftForCell,
  getEmp,
  currentUser,
  isAdmin,
  onSave,
  onOpenProfile,
  onOpenPattern,
  onOpenDismiss,
  onRestoreDismissed,
}) => {
  const allMembers = sections.flatMap(s => s.members);

  const defaultDateFrom = initialDate ?? (days.length > 0 ? dateStr(year, month, days[0].d) : '');
  const defaultDateTo = initialDate ?? (days.length > 0 ? dateStr(year, month, days[0].d) : '');

  const [selectedOperator, setSelectedOperator] = useState<string>(initialOperator ?? allMembers[0] ?? '');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [selectedShiftType, setSelectedShiftType] = useState<string>('');
  const [extraPlusEvents, setExtraPlusEvents] = useState<Array<{ type: string; hours: number }>>([]);
  const [extraMinusEvents, setExtraMinusEvents] = useState<Array<{ type: string; hours: number }>>([]);
  const [note, setNote] = useState('');
  const [customHours, setCustomHours] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load existing overrides when quick-editing a specific cell
  useEffect(() => {
    if (!open) return;
    const op = initialOperator ?? allMembers[0] ?? '';
    setSelectedOperator(op);
    setDateFrom(defaultDateFrom);
    setDateTo(defaultDateTo);

    if (initialDate && op) {
      const key = `${op}:${initialDate}`;
      const ovr = overrides[key];
      if (ovr) {
        setSelectedShiftType(ovr.type);
        setNote(ovr.note ?? '');
        setCustomHours(ovr.customHours != null ? String(ovr.customHours) : '');
        const plus = (ovr.extraEvents ?? []).filter(e => !e.type.startsWith('loss_')).map(e => ({ type: e.type, hours: e.hours }));
        const minus = (ovr.extraEvents ?? []).filter(e => e.type.startsWith('loss_')).map(e => ({ type: e.type, hours: e.hours }));
        setExtraPlusEvents(plus);
        setExtraMinusEvents(minus);
      } else {
        const di = days.findIndex(d => dateStr(year, month, d.d) === initialDate);
        const type = di >= 0 ? getShiftForCell(op, di) : '';
        setSelectedShiftType(type);
        setNote('');
        setCustomHours('');
        setExtraPlusEvents([]);
        setExtraMinusEvents([]);
      }
    } else {
      setSelectedShiftType('');
      setNote('');
      setCustomHours('');
      setExtraPlusEvents([]);
      setExtraMinusEvents([]);
    }
    setError('');
  }, [open, initialOperator, initialDate]);

  // Auto-behaviors
  useEffect(() => {
    if (selectedShiftType === 'sick') {
      setExtraMinusEvents(prev => {
        if (prev.some(e => e.type === 'loss_sick')) return prev;
        return [...prev, { type: 'loss_sick', hours: 11 }];
      });
    }
    if (selectedShiftType === 'birthday') {
      setExtraPlusEvents(prev => {
        if (prev.some(e => e.type === 'extra_org_plus')) return prev;
        return [...prev, { type: 'extra_org_plus', hours: 11 }];
      });
    }
  }, [selectedShiftType]);

  const isExtraType = selectedShiftType.startsWith('extra_');
  const hasExtraEvents = extraPlusEvents.length > 0 || extraMinusEvents.length > 0;
  const needNote = selectedShiftType === 'sick' || hasExtraEvents;

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const minDate = `${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const maxDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

  const handleSave = useCallback(async () => {
    if (!selectedOperator) { setError('Выберите оператора'); return; }
    if (!selectedShiftType) { setError('Выберите тип смены'); return; }
    if (needNote && !note.trim()) { setError('Введите примечание'); return; }

    const newOverrides = { ...overrides };
    const logEntries: Array<{ action: string; target?: string }> = [];

    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    if (from > to) { setError('Дата начала позже даты конца'); return; }

    const extraEvents: ExtraEvent[] = [
      ...extraPlusEvents.map(e => ({ type: e.type, hours: e.hours })),
      ...extraMinusEvents.map(e => ({ type: e.type, hours: e.hours })),
    ];

    const cur = new Date(from);
    while (cur <= to) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      const key = `${selectedOperator}:${ds}`;
      const ovr: Override = {
        type: selectedShiftType,
        note: note.trim() || undefined,
        customHours: isExtraType && customHours !== '' ? Number(customHours) : null,
        extraEvents: extraEvents.length > 0 ? extraEvents : undefined,
        editedBy: currentUser?.email,
        editedAt: new Date().toISOString(),
      };
      newOverrides[key] = ovr;
      logEntries.push({ action: `set_shift:${selectedShiftType}`, target: key });
      cur.setDate(cur.getDate() + 1);
    }

    setSaving(true);
    setError('');
    try {
      await onSave(newOverrides, logEntries);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }, [selectedOperator, selectedShiftType, dateFrom, dateTo, extraPlusEvents, extraMinusEvents, note, customHours, isExtraType, overrides, currentUser, needNote, onSave, onClose]);

  const isDismissed = selectedOperator ? !!dismissedEmployees[selectedOperator] : false;

  if (!open) return null;

  const groups = ALL_GROUPS.map(g => ({
    group: g,
    types: SHIFT_TYPES_ALL.filter(t => t.group === g),
  })).filter(g => g.types.length > 0);

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-title">
          Редактор смены
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="form-label">Оператор</label>
            <select
              className="form-select"
              value={selectedOperator}
              onChange={e => setSelectedOperator(e.target.value)}
            >
              {sections.map(s => (
                <optgroup key={s.key} label={s.label}>
                  {s.members.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {selectedOperator && (
          <div className="form-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => onOpenProfile(selectedOperator)}>Профиль</button>
            {isAdmin && <button className="btn btn-secondary" onClick={() => onOpenPattern(selectedOperator)}>Паттерн</button>}
            {isAdmin && !isDismissed && <button className="btn btn-danger" onClick={onOpenDismiss}>Уволить</button>}
            {isAdmin && isDismissed && <button className="btn btn-secondary" onClick={() => onRestoreDismissed(selectedOperator)}>Восстановить</button>}
          </div>
        )}

        <div className="form-row">
          <div className="form-field">
            <label className="form-label">С</label>
            <input className="form-input" type="date" value={dateFrom} min={minDate} max={maxDate} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">По</label>
            <input className="form-input" type="date" value={dateTo} min={minDate} max={maxDate} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="form-field">
          <label className="form-label">Тип смены</label>
          <div className="shift-type-grid">
            {groups.map(({ group, types }) => (
              <div key={String(group)}>
                <div className="shift-type-group-label">{groupLabel(group)}</div>
                {types.map(t => (
                  <div key={t.type} className="shift-type-row">
                    <button
                      className={`shift-type-btn${selectedShiftType === t.type ? ' active' : ''}`}
                      onClick={() => setSelectedShiftType(t.type)}
                    >
                      {t.label}
                    </button>
                    <span className="stime">{t.time}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {isExtraType && (
          <div className="form-field">
            <label className="form-label">Кол-во часов (доп. смена)</label>
            <input
              className="form-input"
              type="number"
              min={0}
              max={24}
              value={customHours}
              onChange={e => setCustomHours(e.target.value)}
              placeholder="По умолчанию (из профиля)"
            />
          </div>
        )}

        <div className="form-field">
          <label className="form-label">Доп. события (+)</label>
          {extraPlusEvents.map((ev, i) => (
            <div key={i} className="extra-event-row">
              <select
                className="extra-event-select"
                value={ev.type}
                onChange={e => setExtraPlusEvents(prev => prev.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
              >
                {EXTRA_PLUS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                className="extra-event-hours"
                type="number"
                min={0}
                max={24}
                value={ev.hours}
                onChange={e => setExtraPlusEvents(prev => prev.map((x, j) => j === i ? { ...x, hours: Number(e.target.value) } : x))}
              />
              <button className="extra-event-remove" onClick={() => setExtraPlusEvents(prev => prev.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="btn btn-secondary" onClick={() => setExtraPlusEvents(prev => [...prev, { type: EXTRA_PLUS_TYPES[0].value, hours: 11 }])}>+ Добавить</button>
        </div>

        <div className="form-field">
          <label className="form-label">Доп. события (-)</label>
          {extraMinusEvents.map((ev, i) => (
            <div key={i} className="extra-event-row">
              <select
                className="extra-event-select"
                value={ev.type}
                onChange={e => setExtraMinusEvents(prev => prev.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
              >
                {EXTRA_MINUS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                className="extra-event-hours"
                type="number"
                min={0}
                max={24}
                value={ev.hours}
                onChange={e => setExtraMinusEvents(prev => prev.map((x, j) => j === i ? { ...x, hours: Number(e.target.value) } : x))}
              />
              <button className="extra-event-remove" onClick={() => setExtraMinusEvents(prev => prev.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="btn btn-secondary" onClick={() => setExtraMinusEvents(prev => [...prev, { type: EXTRA_MINUS_TYPES[0].value, hours: 11 }])}>+ Добавить</button>
        </div>

        <div className="form-field">
          <label className="form-label">Примечание{needNote ? ' *' : ''}</label>
          <input
            className="form-input"
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={needNote ? 'Обязательно' : 'Необязательно'}
          />
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

export default ShiftEditorModal;
