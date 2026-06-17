import React, { useState, useEffect, useMemo } from 'react';
import type { Override } from '@/lib/scheduleLogic';
import { getPatternEntries, parseLocalDate, localDs, plusDays } from '@/lib/scheduleLogic';
import { PATTERN_PRESETS, PATTERN_PRESET_LABELS, SHIFT_DEFS } from '@/lib/shiftDefs';

interface PatternModalProps {
  open: boolean;
  name: string | null;
  onClose: () => void;
  settings: any;
  overrides: Record<string, Override>;
  year: number;
  month: number;
  version: number;
  onSave: (newSettings: any, logEntries: Array<{ action: string; target?: string }>) => Promise<void>;
}

// Pattern type options: non-extra, non-legacy types + 'off'
const patternTypeOptions = Object.entries(SHIFT_DEFS)
  .filter(([type, def]) => !def.isExtra && !def.legacy && type !== 'dismissed')
  .map(([type, def]) => ({ type, label: def.label }));

const DEFAULT_CYCLE_START = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}-01`;

const PatternModal: React.FC<PatternModalProps> = ({
  open,
  name,
  onClose,
  settings,
  overrides,
  year,
  month,
  version,
  onSave,
}) => {
  const presetKeys = Object.keys(PATTERN_PRESETS);

  const [preset, setPreset] = useState<string>('morning_evening');
  const [cycleStart, setCycleStart] = useState<string>(DEFAULT_CYCLE_START(year, month));
  const [customLength, setCustomLength] = useState<number>(4);
  const [customPattern, setCustomPattern] = useState<string[]>(['morning', 'off', 'off', 'off']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPreset('morning_evening');
    setCycleStart(DEFAULT_CYCLE_START(year, month));
    setCustomLength(4);
    setCustomPattern(['morning', 'off', 'off', 'off']);
    setError('');
  }, [open, name, year, month]);

  const effectivePattern: string[] = useMemo(() => {
    if (preset === 'custom') return customPattern;
    return PATTERN_PRESETS[preset] ?? [];
  }, [preset, customPattern]);

  const handleLengthChange = (len: number) => {
    setCustomLength(len);
    setCustomPattern(prev => {
      const next = [...prev];
      while (next.length < len) next.push('off');
      return next.slice(0, len);
    });
  };

  // Preview: 14 days from cycleStart
  const preview = useMemo(() => {
    if (!effectivePattern.length) return [];
    const result: Array<{ ds: string; type: string }> = [];
    for (let i = 0; i < 14; i++) {
      const ds = plusDays(cycleStart, i);
      const idx = ((i % effectivePattern.length) + effectivePattern.length) % effectivePattern.length;
      result.push({ ds, type: effectivePattern[idx] });
    }
    return result;
  }, [effectivePattern, cycleStart]);

  const handleSave = async () => {
    if (!name) return;
    if (!effectivePattern.length) { setError('Паттерн пуст'); return; }
    if (!cycleStart) { setError('Укажите дату начала'); return; }

    const newEntry = { pattern: effectivePattern, cycleStart, v: 2 };
    const existing = settings.operatorPatterns?.[name] ?? [];
    const arr = Array.isArray(existing) ? existing : [existing];
    const newPatterns = { ...settings.operatorPatterns, [name]: [...arr, newEntry] };
    const newSettings = { ...settings, operatorPatterns: newPatterns };

    setSaving(true);
    setError('');
    try {
      await onSave(newSettings, [{ action: 'set_pattern', target: name }]);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (!open || !name) return null;

  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-title">
          Паттерн: {name}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-field">
          <label className="form-label">Пресет</label>
          <select className="form-select" value={preset} onChange={e => setPreset(e.target.value)}>
            {presetKeys.map(key => (
              <option key={key} value={key}>{PATTERN_PRESET_LABELS[key] ?? key}</option>
            ))}
            <option value="custom">{PATTERN_PRESET_LABELS.custom}</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-label">Начало цикла</label>
          <input
            className="form-input"
            type="date"
            value={cycleStart}
            onChange={e => setCycleStart(e.target.value)}
          />
        </div>

        {preset === 'custom' && (
          <div className="form-field">
            <label className="form-label">Длина паттерна</label>
            <select
              className="form-select"
              value={customLength}
              onChange={e => handleLengthChange(Number(e.target.value))}
            >
              {Array.from({ length: 14 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n} дн.</option>
              ))}
            </select>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {customPattern.map((type, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>Д{i + 1}</span>
                  <select
                    className="form-select"
                    style={{ padding: '2px 4px', fontSize: 12, minWidth: 90 }}
                    value={type}
                    onChange={e => setCustomPattern(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                  >
                    {patternTypeOptions.map(opt => (
                      <option key={opt.type} value={opt.type}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {effectivePattern.length > 0 && (
          <div className="form-field">
            <label className="form-label">Предпросмотр (14 дней)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {preview.map(({ ds, type }, i) => (
                <div
                  key={i}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 11,
                    background: 'var(--c-bg2)',
                    border: '1px solid var(--c-border)',
                  }}
                >
                  <div style={{ color: 'var(--c-muted)' }}>{ds.slice(5)}</div>
                  <div>{SHIFT_DEFS[type]?.label ?? type}</div>
                </div>
              ))}
            </div>
          </div>
        )}

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

export default PatternModal;
