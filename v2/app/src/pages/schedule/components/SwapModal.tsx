import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { SectionDef } from '@/lib/useScheduleState';
import type { Override } from '@/lib/scheduleLogic';
import {
  swapRemainingHours,
  swapCandidateOk,
  swapFmtH,
  swapFmtRange,
  swapGroupOf,
  swapShiftOnDate,
  dateStr,
} from '@/lib/scheduleLogic';
import { SHIFT_DEFS, SWAP_MIN_REST, SWAP_BLOCK_DAY } from '@/lib/shiftDefs';
import { submitSwapRequest } from '@/lib/scheduleApi';

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  days: Array<{ d: number; date: Date }>;
  sections: SectionDef[];
  overrides: Record<string, Override>;
  dismissedEmployees: Record<string, string>;
  operatorPatterns: Record<string, any>;
  operatorBaseShifts: Record<string, (date: Date) => string>;
  getEmp: (name: string) => { email: string; position: string; hours?: number };
  getShiftForCell: (name: string, di: number) => string;
  currentUser: { email: string; role: string } | null;
  isAdmin: boolean;
  employeeHoursSeed: Record<string, number>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const SwapModal: React.FC<SwapModalProps> = ({
  open,
  onClose,
  year,
  month,
  days,
  sections,
  overrides,
  dismissedEmployees,
  operatorPatterns,
  operatorBaseShifts,
  getEmp,
  getShiftForCell,
  currentUser,
  isAdmin,
  employeeHoursSeed,
  onSuccess,
  onError,
}) => {
  const supportMembers = useMemo(() => {
    const reg = sections.find(s => s.key === 'regular_support')?.members ?? [];
    const vip = sections.find(s => s.key === 'vip_support')?.members ?? [];
    return [...reg, ...vip];
  }, [sections]);

  // Find current user's name by email
  const currentUserName = useMemo(() => {
    if (!currentUser) return null;
    return supportMembers.find(name => getEmp(name).email === currentUser.email) ?? null;
  }, [currentUser, supportMembers, getEmp]);

  const [giver, setGiver] = useState<string>('');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(-1);
  const [fromHour, setFromHour] = useState<number>(0);
  const [toHour, setToHour] = useState<number>(0);
  const [recipient, setRecipient] = useState<string>('');
  const [withLunch, setWithLunch] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const defaultGiver = isAdmin ? (supportMembers[0] ?? '') : (currentUserName ?? '');
    setGiver(defaultGiver);
    setSelectedDayIndex(-1);
    setFromHour(0);
    setToHour(0);
    setRecipient('');
    setWithLunch(false);
    setComment('');
  }, [open, isAdmin, currentUserName, supportMembers]);

  // Days where giver has a givable shift and remaining hours > 0
  const givableDays = useMemo(() => {
    if (!giver) return [];
    return days.filter((day, di) => {
      const type = getShiftForCell(giver, di);
      if (!SHIFT_DEFS[type]?.givable) return false;
      const rem = swapRemainingHours(giver, day.d, type, year, month, overrides, employeeHoursSeed);
      return rem > 0;
    });
  }, [giver, days, getShiftForCell, year, month, overrides, employeeHoursSeed]);

  const selectedDay = selectedDayIndex >= 0 ? days[selectedDayIndex] : null;
  const shiftType = selectedDay ? getShiftForCell(giver, selectedDayIndex) : '';
  const shiftDef = shiftType ? SHIFT_DEFS[shiftType] : null;
  const shiftWindow = shiftDef?.window ?? null;

  // Hour range for from/to
  const hourOptions = useMemo(() => {
    if (!shiftWindow) return [];
    const opts: number[] = [];
    for (let h = shiftWindow[0]; h <= shiftWindow[1]; h++) opts.push(h);
    return opts;
  }, [shiftWindow]);

  useEffect(() => {
    if (shiftWindow) {
      setFromHour(shiftWindow[0]);
      setToHour(shiftWindow[1]);
    }
  }, [selectedDayIndex, shiftWindow]);

  const win: [number, number] = [fromHour, toHour];

  // Eligible recipients
  const recipients = useMemo(() => {
    if (!giver || !selectedDay || !shiftType || fromHour >= toHour) return [];
    return supportMembers.filter(name =>
      swapCandidateOk(
        name, giver, selectedDay.date, win, shiftType,
        year, month, days, overrides, dismissedEmployees, operatorPatterns, operatorBaseShifts, getEmp
      )
    );
  }, [giver, selectedDay, shiftType, fromHour, toHour, supportMembers, win, year, month, days, overrides, dismissedEmployees, operatorPatterns, operatorBaseShifts, getEmp]);

  const handleSubmit = useCallback(async () => {
    if (!giver || !selectedDay || !recipient || !shiftType || fromHour >= toHour) return;

    const recipientEmp = getEmp(recipient);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const dateDsStr = dateStr(year, month, selectedDay.d);
    const range = swapFmtRange(fromHour, toHour);
    const hours = toHour - fromHour;
    const label = SHIFT_DEFS[shiftType]?.label ?? shiftType;

    setSubmitting(true);
    try {
      await submitSwapRequest({
        project: 'sg',
        month: monthStr,
        date: dateDsStr,
        giver,
        recipient,
        recipientEmail: recipientEmp.email,
        shiftType,
        shiftLabel: label,
        range,
        hours,
        win,
        withLunch,
        comment,
      });
      onSuccess(`Запрос отправлен: ${giver} → ${recipient} ${range}`);
      onClose();
    } catch (e: any) {
      onError(e?.message ?? 'Ошибка отправки');
    } finally {
      setSubmitting(false);
    }
  }, [giver, selectedDay, recipient, shiftType, fromHour, toHour, win, withLunch, comment, year, month, getEmp, onSuccess, onError, onClose]);

  if (!open) return null;

  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-title">
          Запрос обмена смены
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-field">
          <label className="form-label">Отдающий</label>
          {isAdmin ? (
            <select className="form-select" value={giver} onChange={e => { setGiver(e.target.value); setSelectedDayIndex(-1); setRecipient(''); }}>
              <option value="">— выберите —</option>
              {supportMembers.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : (
            <div className="form-input" style={{ background: 'var(--c-bg2)', userSelect: 'none' }}>{giver || '—'}</div>
          )}
        </div>

        <div className="form-field">
          <label className="form-label">Дата</label>
          <select
            className="form-select"
            value={selectedDayIndex}
            onChange={e => { setSelectedDayIndex(Number(e.target.value)); setRecipient(''); }}
            disabled={!giver}
          >
            <option value={-1}>— выберите день —</option>
            {givableDays.map(day => {
              const di = days.indexOf(day);
              return <option key={day.d} value={di}>{day.date.toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'short' })}</option>;
            })}
          </select>
        </div>

        {selectedDay && shiftWindow && (
          <>
            <div className="form-row">
              <div className="form-field">
                <label className="form-label">С</label>
                <select className="form-select" value={fromHour} onChange={e => setFromHour(Number(e.target.value))}>
                  {hourOptions.filter(h => h < toHour).map(h => <option key={h} value={h}>{swapFmtH(h)}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">До</label>
                <select className="form-select" value={toHour} onChange={e => setToHour(Number(e.target.value))}>
                  {hourOptions.filter(h => h > fromHour).map(h => <option key={h} value={h}>{swapFmtH(h)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 8 }}>
              Диапазон: {swapFmtRange(fromHour, toHour)} — {toHour - fromHour} ч
            </div>
          </>
        )}

        <div className="form-field">
          <label className="form-label">Получатель</label>
          <select
            className="form-select"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            disabled={recipients.length === 0}
          >
            <option value="">— выберите —</option>
            {recipients.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          {selectedDay && recipients.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>Нет доступных получателей</div>
          )}
        </div>

        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={withLunch} onChange={e => setWithLunch(e.target.checked)} />
            С обедом
          </label>
        </div>

        <div className="form-field">
          <label className="form-label">Комментарий</label>
          <input className="form-input" type="text" value={comment} onChange={e => setComment(e.target.value)} placeholder="Необязательно" />
        </div>

        <div className="btn-row">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !giver || !selectedDay || !recipient || fromHour >= toHour}
          >
            {submitting ? 'Отправка...' : 'Отправить запрос'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SwapModal;
