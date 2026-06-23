import React, { useMemo } from 'react';
import type { SectionDef } from '@/lib/useScheduleState';
import type { Override } from '@/lib/scheduleLogic';
import { calcDayHours } from '@/lib/scheduleLogic';
import { MIN_STAFF } from '@/lib/shiftDefs';
import type { ProjectKey } from '@/lib/projects';

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
  project: ProjectKey;
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

const SgDayInfo: React.FC<DayInfoPanelProps> = ({
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

          {/* Regular Support */}
          <div className="day-info-block">
            <div className="day-info-block-title">Regular Support</div>
            {([
              { color: '#60a5fa', label: '09–21', val: info.regDay,   low: info.regDay   < MIN_STAFF.day },
              { color: '#818cf8', label: '21–09', val: info.regNight, low: info.regNight < MIN_STAFF.night },
              { color: '#f59e0b', label: '12–00', val: info.reg1200,  low: info.reg1200  < MIN_STAFF.d12 },
            ] as const).map(row => (
              <div key={row.label} className="day-info-row">
                <span className="day-info-shift-label" style={{ color: row.color }}>
                  <span className="day-info-dot" style={{ background: row.color }} />
                  {row.label}
                </span>
                <span className="day-info-num" style={{ color: row.low ? 'var(--c-red)' : row.color }}>
                  {fmt(row.val)}
                  {row.low && <span className="day-info-warn">⚠</span>}
                </span>
              </div>
            ))}
          </div>

          {/* VIP Support */}
          <div className="day-info-block">
            <div className="day-info-block-title">VIP Support</div>
            {([
              { color: '#2dd4bf', label: '09–21', val: info.vipDay,   low: info.vipDay   < MIN_STAFF.day },
              { color: '#e879f9', label: '21–09', val: info.vipNight, low: info.vipNight < MIN_STAFF.night },
              { color: '#a3e635', label: '12–00', val: info.vip1200,  low: info.vip1200  < MIN_STAFF.d12 },
            ] as const).map(row => (
              <div key={row.label} className="day-info-row">
                <span className="day-info-shift-label" style={{ color: row.color }}>
                  <span className="day-info-dot" style={{ background: row.color }} />
                  {row.label}
                </span>
                <span className="day-info-num" style={{ color: row.low ? 'var(--c-red)' : row.color }}>
                  {fmt(row.val)}
                  {row.low && <span className="day-info-warn">⚠</span>}
                </span>
              </div>
            ))}
          </div>

          {/* Supervisors */}
          <div className="day-info-block">
            <div className="day-info-block-title">Супервизоры</div>
            {([
              { color: '#facc15', label: 'День',  names: info.supDayNames },
              { color: '#991b1b', label: 'Ночь',  names: info.supNightNames },
            ] as const).map(row => (
              <div key={row.label} className="day-info-row day-info-row-names">
                <span className="day-info-shift-label" style={{ color: row.color }}>
                  <span className="day-info-dot" style={{ background: row.color }} />
                  {row.label}
                </span>
                <span className="day-info-names-list">
                  {row.names.length > 0
                    ? row.names.map(n => <span key={n} className="day-info-name">{n}</span>)
                    : <span className="day-info-name day-info-name-empty">—</span>}
                </span>
              </div>
            ))}
          </div>

          {/* VIP Supervisors */}
          <div className="day-info-block">
            <div className="day-info-block-title">VIP Супервизоры</div>
            {([
              { color: '#e879f9', label: 'День',  names: info.vipSupDayAlt },
              { color: '#818cf8', label: 'Ночь',  names: info.vipSupNightNames },
            ] as const).map(row => (
              <div key={row.label} className="day-info-row day-info-row-names">
                <span className="day-info-shift-label" style={{ color: row.color }}>
                  <span className="day-info-dot" style={{ background: row.color }} />
                  {row.label}
                </span>
                <span className="day-info-names-list">
                  {row.names.length > 0
                    ? row.names.map(n => <span key={n} className="day-info-name">{n}</span>)
                    : <span className="day-info-name day-info-name-empty">—</span>}
                </span>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
};

// Панель дня для НК: «на смене» (Support NC день/ночь) + имена супервайзеров и
// саппорта на смене. Секции/пороги берутся из конфига проекта (support_nk.count).
const NkDayInfo: React.FC<DayInfoPanelProps> = ({
  dateStr, dayIndex, days, sections, getShiftForCell, overrides, employeeHoursSeed, onClose,
}) => {
  const info = useMemo(() => {
    if (dateStr === null || dayIndex < 0 || dayIndex >= days.length) return null;
    const supportSec = sections.find(s => s.key === 'support_nk');
    const supSec = sections.find(s => s.key === 'supervisors_nk');
    const cfg = supportSec?.count;
    const dayTypes = cfg?.dayTypes ?? ['morning', 'extra_morning'];
    const nightTypes = cfg?.nightTypes ?? ['evening', 'extra_evening'];

    const getType = (n: string) => getShiftForCell(n, dayIndex);
    const getH = (n: string, t: string) => calcDayHours(t, overrides[`${n}:${dateStr}`], n, employeeHoursSeed);
    const frac = (members: string[], types: string[]) => {
      let s = 0;
      for (const n of members) { const t = getType(n); if (types.includes(t)) s += getH(n, t) / 11; }
      return s;
    };
    const namesOn = (members: string[], types: string[]) =>
      members.filter(n => { const t = getType(n); return types.includes(t) && getH(n, t) > 0; });

    const supportMembers = supportSec?.members ?? [];
    const supMembers = supSec?.members ?? [];
    const d = days[dayIndex];
    return {
      dateLabel: d.date.toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' }),
      day: frac(supportMembers, dayTypes), night: frac(supportMembers, nightTypes),
      dayMin: cfg?.dayMin ?? 2, nightMin: cfg?.nightMin ?? 1,
      supDayNames: namesOn(supMembers, dayTypes), supNightNames: namesOn(supMembers, nightTypes),
      supportDayNames: namesOn(supportMembers, dayTypes), supportNightNames: namesOn(supportMembers, nightTypes),
    };
  }, [dateStr, dayIndex, days, sections, getShiftForCell, overrides, employeeHoursSeed]);

  const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
  if (dateStr === null) return null;

  const nameBlock = (title: string, rows: Array<{ color: string; label: string; names: string[] }>) => (
    <div className="day-info-block">
      <div className="day-info-block-title">{title}</div>
      {rows.map(row => (
        <div key={row.label} className="day-info-row day-info-row-names">
          <span className="day-info-shift-label" style={{ color: row.color }}>
            <span className="day-info-dot" style={{ background: row.color }} />{row.label}
          </span>
          <span className="day-info-names-list">
            {row.names.length > 0
              ? row.names.map(n => <span key={n} className="day-info-name">{n}</span>)
              : <span className="day-info-name day-info-name-empty">—</span>}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="day-info-panel open">
      <div className="day-info-header">
        <div className="day-info-title">{info?.dateLabel ?? ''}</div>
        <button className="day-info-close" onClick={onClose}>✕</button>
      </div>
      {info && (
        <div className="day-info-body">
          <div className="day-info-block">
            <div className="day-info-block-title">Support NC — на смене</div>
            {([
              { color: '#60a5fa', label: '09–21', val: info.day,   low: info.day   < info.dayMin },
              { color: '#818cf8', label: '21–09', val: info.night, low: info.night < info.nightMin },
            ] as const).map(row => (
              <div key={row.label} className="day-info-row">
                <span className="day-info-shift-label" style={{ color: row.color }}>
                  <span className="day-info-dot" style={{ background: row.color }} />{row.label}
                </span>
                <span className="day-info-num" style={{ color: row.low ? 'var(--c-red)' : row.color }}>
                  {fmt(row.val)}{row.low && <span className="day-info-warn">⚠</span>}
                </span>
              </div>
            ))}
          </div>
          {nameBlock('Supervisors', [
            { color: '#facc15', label: 'День', names: info.supDayNames },
            { color: '#991b1b', label: 'Ночь', names: info.supNightNames },
          ])}
          {nameBlock('Support NC', [
            { color: '#60a5fa', label: 'День', names: info.supportDayNames },
            { color: '#818cf8', label: 'Ночь', names: info.supportNightNames },
          ])}
        </div>
      )}
    </div>
  );
};

const DayInfoPanel: React.FC<DayInfoPanelProps> = (props) =>
  props.project === 'nk' ? <NkDayInfo {...props} /> : <SgDayInfo {...props} />;

export default React.memo(DayInfoPanel);
