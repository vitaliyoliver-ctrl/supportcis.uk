import React, { useMemo } from 'react';
import type { SectionDef } from '@/lib/useScheduleState';
import type { Override } from '@/lib/scheduleLogic';
import { calcDayHours } from '@/lib/scheduleLogic';
import { MIN_STAFF } from '@/lib/shiftDefs';

interface DayInfoPanelProps {
  dateStr: string | null;
  dayIndex: number;
  days: Array<{ d: number; date: Date }>;
  sections: SectionDef[];
  getShiftForCell: (name: string, di: number) => string;
  overrides: Record<string, Override>;
  employeeHoursSeed: Record<string, number>;
  getEmp: (name: string) => { hours?: number; position: string };
  onClose: () => void;
}

const REGULAR_SUPS = new Set(['Curtis', 'Manuel', 'Richard', 'Irma', 'Solomon', 'Toby']);
const VIP_SUPS = new Set(['Adam', 'Amelia', 'Lucas']);

const REG_DAY_TYPES = new Set(['morning', 'extra_morning']);
const REG_NIGHT_TYPES = new Set(['evening', 'extra_evening']);
const REG_1200_TYPES = new Set(['shift1200', 'extra_1200']);
const VIP_DAY_TYPES = new Set(['vip_evening', 'extra_vip_evening']);
const VIP_NIGHT_TYPES = new Set(['vip_morning', 'extra_vip_morning']);
const VIP_1200_TYPES = new Set(['vip_1200', 'extra_vip_1200']);
const SUP_DAY_TYPES = new Set(['super_day', 'extra_sup_day', 'extra_sup_day8', 'super_day8']);
const SUP_NIGHT_TYPES = new Set(['super_night', 'extra_sup_night']);

const DayInfoPanel: React.FC<DayInfoPanelProps> = ({
  dateStr,
  dayIndex,
  days,
  sections,
  getShiftForCell,
  overrides,
  employeeHoursSeed,
  getEmp: _getEmp,
  onClose,
}) => {
  const info = useMemo(() => {
    if (dateStr === null || dayIndex < 0 || dayIndex >= days.length) return null;

    const regularSection = sections.find(s => s.key === 'regular_support');
    const vipSection = sections.find(s => s.key === 'vip_support');

    const allMembers = sections.flatMap(s => s.members);

    const getType = (name: string) => getShiftForCell(name, dayIndex);
    const getOvr = (name: string): Override | undefined => overrides[`${name}:${dateStr}`];

    const fracCount = (members: string[], typeSet: Set<string>): number => {
      let sum = 0;
      for (const name of members) {
        const t = getType(name);
        if (typeSet.has(t)) {
          const h = calcDayHours(t, getOvr(name), name, employeeHoursSeed);
          sum += h / 11;
        }
      }
      return sum;
    };

    const nameList = (members: string[], typeSet: Set<string>): string[] =>
      members.filter(name => typeSet.has(getType(name)));

    const regMembers = regularSection?.members ?? [];
    const vipMembers = vipSection?.members ?? [];

    const regDay = fracCount(regMembers, REG_DAY_TYPES);
    const regNight = fracCount(regMembers, REG_NIGHT_TYPES);
    const reg1200 = fracCount(regMembers, REG_1200_TYPES);

    const vipDay = fracCount(vipMembers, VIP_DAY_TYPES);
    const vipNight = fracCount(vipMembers, VIP_NIGHT_TYPES);
    const vip1200 = fracCount(vipMembers, VIP_1200_TYPES);

    const supDayNames = nameList(allMembers, SUP_DAY_TYPES).filter(n => REGULAR_SUPS.has(n));
    const supNightNames = nameList(allMembers, SUP_NIGHT_TYPES).filter(n => REGULAR_SUPS.has(n));
    const vipSupDayNames = nameList(allMembers, SUP_DAY_TYPES).filter(n => VIP_SUPS.has(n));
    const vipSupNightNames = nameList(allMembers, SUP_NIGHT_TYPES).filter(n => VIP_SUPS.has(n));

    // Swap events from overrides
    const swaps: Array<{ name: string; type: 'give' | 'take'; swapWith?: string; hours: number; range?: string }> = [];
    for (const name of allMembers) {
      const ovr = getOvr(name);
      if (!ovr?.extraEvents) continue;
      for (const ev of ovr.extraEvents) {
        if (ev.type === 'loss_swap_give') {
          swaps.push({ name, type: 'give', swapWith: ev.swapWith, hours: ev.hours, range: ev.range });
        } else if (ev.type === 'extra_swap_take') {
          swaps.push({ name, type: 'take', swapWith: ev.swapWith, hours: ev.hours, range: ev.range });
        }
      }
    }

    const d = days[dayIndex];
    const dateLabel = d.date.toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' });

    return { dateLabel, regDay, regNight, reg1200, vipDay, vipNight, vip1200, supDayNames, supNightNames, vipSupDayNames, vipSupNightNames, swaps };
  }, [dateStr, dayIndex, days, sections, getShiftForCell, overrides, employeeHoursSeed]);

  const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);

  if (dateStr === null) return null;

  return (
    <div className="day-info-panel open">
      <div className="day-info-header">
        <div className="day-info-title">{info?.dateLabel ?? ''}</div>
        <button className="day-info-close" onClick={onClose}>✕</button>
      </div>
      {info && (
        <div className="day-info-body">
          <div className="day-info-block">
            <div className="day-info-block-title">Regular Support</div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#4caf93' }} />
              09–21: <b>{fmt(info.regDay)}</b>
              {info.regDay < MIN_STAFF.day && <span style={{ color: 'var(--c-red)', marginLeft: 4 }}>⚠</span>}
            </div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#7b8fbc' }} />
              21–09: <b>{fmt(info.regNight)}</b>
              {info.regNight < MIN_STAFF.night && <span style={{ color: 'var(--c-red)', marginLeft: 4 }}>⚠</span>}
            </div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#e0b84a' }} />
              12–00: <b>{fmt(info.reg1200)}</b>
              {info.reg1200 < MIN_STAFF.d12 && <span style={{ color: 'var(--c-red)', marginLeft: 4 }}>⚠</span>}
            </div>
          </div>

          <div className="day-info-block">
            <div className="day-info-block-title">VIP Support</div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#c97dbe' }} />
              09–21: <b>{fmt(info.vipDay)}</b>
            </div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#7b8fbc' }} />
              21–09: <b>{fmt(info.vipNight)}</b>
            </div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#e0b84a' }} />
              12–00: <b>{fmt(info.vip1200)}</b>
            </div>
          </div>

          <div className="day-info-block">
            <div className="day-info-block-title">Супервизоры</div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#4caf93' }} />
              День:
              {info.supDayNames.length > 0
                ? info.supDayNames.map(n => <span key={n} className="day-info-name">{n}</span>)
                : <span className="day-info-name" style={{ color: 'var(--c-muted)' }}>—</span>}
            </div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#7b8fbc' }} />
              Ночь:
              {info.supNightNames.length > 0
                ? info.supNightNames.map(n => <span key={n} className="day-info-name">{n}</span>)
                : <span className="day-info-name" style={{ color: 'var(--c-muted)' }}>—</span>}
            </div>
          </div>

          <div className="day-info-block">
            <div className="day-info-block-title">VIP Супервизоры</div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#c97dbe' }} />
              День:
              {info.vipSupDayNames.length > 0
                ? info.vipSupDayNames.map(n => <span key={n} className="day-info-name">{n}</span>)
                : <span className="day-info-name" style={{ color: 'var(--c-muted)' }}>—</span>}
            </div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#7b8fbc' }} />
              Ночь:
              {info.vipSupNightNames.length > 0
                ? info.vipSupNightNames.map(n => <span key={n} className="day-info-name">{n}</span>)
                : <span className="day-info-name" style={{ color: 'var(--c-muted)' }}>—</span>}
            </div>
          </div>

          {info.swaps.length > 0 && (
            <div className="day-info-block">
              <div className="day-info-block-title">Обмены</div>
              {info.swaps.map((s, i) => (
                <div key={i} className="day-info-count">
                  <span className="day-info-dot" style={{ background: s.type === 'take' ? '#4caf93' : '#e07070' }} />
                  <span className="day-info-name">{s.name}</span>
                  {s.type === 'give' ? ' → ' : ' ← '}
                  <span className="day-info-name">{s.swapWith ?? '?'}</span>
                  {' '}{s.hours}ч{s.range ? ` ${s.range}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(DayInfoPanel);
