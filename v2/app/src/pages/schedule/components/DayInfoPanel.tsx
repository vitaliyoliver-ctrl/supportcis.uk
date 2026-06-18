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

const REG_DAY_TYPES   = new Set(['morning', 'extra_morning']);
const REG_NIGHT_TYPES = new Set(['evening', 'extra_evening']);
const REG_1200_TYPES  = new Set(['shift1200', 'extra_1200']);
const VIP_DAY_TYPES   = new Set(['vip_evening', 'extra_vip_evening']);
const VIP_NIGHT_TYPES = new Set(['vip_morning', 'extra_vip_morning']);
const VIP_1200_TYPES  = new Set(['vip_1200', 'extra_vip_1200']);
const SUP_DAY_TYPES   = new Set(['super_day', 'extra_sup_day', 'extra_sup_day8', 'super_day8']);
const SUP_NIGHT_TYPES = new Set(['super_night', 'extra_sup_night']);

function isSup(pos: string) {
  return pos.includes('Supervisor') || pos.includes('VIP Sup') || pos.includes('Head');
}

const DayInfoPanel: React.FC<DayInfoPanelProps> = ({
  dateStr, dayIndex, days, sections, getShiftForCell, overrides, employeeHoursSeed, getEmp, onClose,
}) => {
  const info = useMemo(() => {
    if (dateStr === null || dayIndex < 0 || dayIndex >= days.length) return null;

    const regularSection = sections.find(s => s.key === 'regular_support');
    const vipSection     = sections.find(s => s.key === 'vip_support');
    const allMembers     = sections.flatMap(s => s.members);

    const getType = (name: string) => getShiftForCell(name, dayIndex);
    const getOvr  = (name: string): Override | undefined => overrides[`${name}:${dateStr}`];
    const getH    = (name: string, t: string) => calcDayHours(t, getOvr(name), name, employeeHoursSeed);

    // Fractional headcount — only non-supervisors
    const fracCount = (members: string[], typeSet: Set<string>): number => {
      let sum = 0;
      for (const name of members) {
        if (isSup(getEmp(name).position)) continue;
        const t = getType(name);
        if (typeSet.has(t)) sum += getH(name, t) / 11;
      }
      return sum;
    };

    // Names of supervisors on shift, only those with hours > 0 (excludes swap-give)
    const supNames = (typeSet: Set<string>, secMembers: string[]): string[] =>
      secMembers.filter(name => {
        if (!isSup(getEmp(name).position)) return false;
        const t = getType(name);
        if (!typeSet.has(t)) return false;
        return getH(name, t) > 0;
      });

    const regMembers = regularSection?.members ?? [];
    const vipMembers = vipSection?.members ?? [];

    const d = days[dayIndex];
    const dateLabel = d.date.toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' });

    return {
      dateLabel,
      regDay:   fracCount(regMembers, REG_DAY_TYPES),
      regNight: fracCount(regMembers, REG_NIGHT_TYPES),
      reg1200:  fracCount(regMembers, REG_1200_TYPES),
      vipDay:   fracCount(vipMembers, VIP_DAY_TYPES),
      vipNight: fracCount(vipMembers, VIP_NIGHT_TYPES),
      vip1200:  fracCount(vipMembers, VIP_1200_TYPES),
      supDayNames:    supNames(SUP_DAY_TYPES,   regMembers),
      supNightNames:  supNames(SUP_NIGHT_TYPES,  regMembers),
      vipSupDayNames:   supNames(SUP_DAY_TYPES,   vipMembers),
      vipSupNightNames: supNames(SUP_NIGHT_TYPES,  vipMembers),
      // Also count sup on VIP shifts (Adam/Lucas/Amelia on super_day)
      vipSupDayAlt:   supNames(SUP_DAY_TYPES,   allMembers).filter(n => vipMembers.includes(n)),
    };
  }, [dateStr, dayIndex, days, sections, getShiftForCell, overrides, employeeHoursSeed, getEmp]);

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
              {info.vipDay < MIN_STAFF.day && <span style={{ color: 'var(--c-red)', marginLeft: 4 }}>⚠</span>}
            </div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#7b8fbc' }} />
              21–09: <b>{fmt(info.vipNight)}</b>
              {info.vipNight < MIN_STAFF.night && <span style={{ color: 'var(--c-red)', marginLeft: 4 }}>⚠</span>}
            </div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#e0b84a' }} />
              12–00: <b>{fmt(info.vip1200)}</b>
              {info.vip1200 < MIN_STAFF.d12 && <span style={{ color: 'var(--c-red)', marginLeft: 4 }}>⚠</span>}
            </div>
          </div>

          <div className="day-info-block">
            <div className="day-info-block-title">Супервизоры</div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#facc15' }} />
              День:
              {info.supDayNames.length > 0
                ? info.supDayNames.map(n => <span key={n} className="day-info-name">{n}</span>)
                : <span className="day-info-name" style={{ color: 'var(--c-muted)' }}>—</span>}
            </div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#991b1b' }} />
              Ночь:
              {info.supNightNames.length > 0
                ? info.supNightNames.map(n => <span key={n} className="day-info-name">{n}</span>)
                : <span className="day-info-name" style={{ color: 'var(--c-muted)' }}>—</span>}
            </div>
          </div>

          <div className="day-info-block">
            <div className="day-info-block-title">VIP Супервизоры</div>
            <div className="day-info-count">
              <span className="day-info-dot" style={{ background: '#e879f9' }} />
              День:
              {info.vipSupDayAlt.length > 0
                ? info.vipSupDayAlt.map(n => <span key={n} className="day-info-name">{n}</span>)
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
        </div>
      )}
    </div>
  );
};

export default React.memo(DayInfoPanel);
