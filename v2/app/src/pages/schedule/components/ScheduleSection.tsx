import React, { useMemo, useRef, useState } from 'react';
import type { SectionDef } from '@/lib/useScheduleState';
import type { Override } from '@/lib/scheduleLogic';
import { calcDayHours, dateStr, shiftCellClass, shiftCellLabel } from '@/lib/scheduleLogic';
import { MIN_STAFF, SHIFT_DEFS } from '@/lib/shiftDefs';

interface ScheduleSectionProps {
  section: SectionDef;
  allSections: SectionDef[];
  collapsed: boolean;
  onToggle: () => void;
  days: Array<{ d: number; date: Date }>;
  year: number;
  month: number;
  overrides: Record<string, Override>;
  selectedDateStr: string | null;
  onSelectDate: (ds: string, di: number) => void;
  getShiftForCell: (name: string, di: number) => string;
  getEmp: (name: string) => { email: string; position: string; since: string; hours?: number };
  employeeHoursSeed: Record<string, number>;
  dismissedEmployees: Record<string, string>;
  isAdmin: boolean;
  positionsMode: boolean;
  infoColumnVisible: boolean;
  onQuickEdit: (name: string, ds: string, di: number) => void;
  onOpenPattern: (name: string) => void;
  onMoveOperator: (srcName: string, fromKey: string, toKey: string, beforeName: string | null, insertAfter: boolean) => void;
}

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const COUNT_SECTION_KEYS = new Set(['regular_support', 'vip_support']);

// Shift types for counting by column for regular/vip sections
const DAY_TYPES = new Set(['morning', 'extra_morning', 'vip_evening', 'extra_vip_evening', 'super_day', 'extra_sup_day', 'super_day8', 'extra_sup_day8']);
const NIGHT_TYPES = new Set(['evening', 'extra_evening', 'vip_morning', 'extra_vip_morning', 'super_night', 'extra_sup_night', 'night']);
const D12_TYPES = new Set(['shift1200', 'extra_1200', 'vip_1200', 'extra_vip_1200']);

function isSupervisorPosition(position: string): boolean {
  return position.includes('Supervisor') || position.includes('VIP Sup');
}

const ScheduleSection: React.FC<ScheduleSectionProps> = ({
  section,
  allSections,
  collapsed,
  onToggle,
  days,
  year,
  month,
  overrides,
  selectedDateStr,
  onSelectDate,
  getShiftForCell,
  getEmp,
  employeeHoursSeed,
  dismissedEmployees,
  isAdmin,
  positionsMode,
  infoColumnVisible,
  onQuickEdit,
  onOpenPattern,
  onMoveOperator,
}) => {
  const [dragOver, setDragOver] = useState<string | null>(null);

  const allMembers = useMemo(() => allSections.flatMap(s => s.members), [allSections]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayD = isCurrentMonth ? today.getDate() : -1;

  // Count rows data (for regular_support and vip_support)
  const countRows = useMemo(() => {
    if (!COUNT_SECTION_KEYS.has(section.key)) return null;
    return days.map((day, di) => {
      let dayCount = 0, nightCount = 0, d12Count = 0;
      for (const name of allMembers) {
        const type = getShiftForCell(name, di);
        const key = `${name}:${dateStr(year, month, day.d)}`;
        const ovr = overrides[key];
        const h = calcDayHours(type, ovr, name, employeeHoursSeed);
        const frac = h / 11;
        if (DAY_TYPES.has(type)) dayCount += frac;
        else if (NIGHT_TYPES.has(type)) nightCount += frac;
        else if (D12_TYPES.has(type)) d12Count += frac;
      }
      return {
        day: dayCount,
        night: nightCount,
        d12: d12Count,
        dayLow: dayCount < MIN_STAFF.day,
        nightLow: nightCount < MIN_STAFF.night,
        d12Low: d12Count < MIN_STAFF.d12,
        anyLow: dayCount < MIN_STAFF.day || nightCount < MIN_STAFF.night || d12Count < MIN_STAFF.d12,
      };
    });
  }, [section.key, allMembers, days, year, month, overrides, employeeHoursSeed, getShiftForCell]);

  const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);

  // Find divider index (after last supervisor, before first non-supervisor)
  const dividerAfterIndex = useMemo(() => {
    let lastSupIdx = -1;
    for (let i = 0; i < section.members.length; i++) {
      const emp = getEmp(section.members[i]);
      if (isSupervisorPosition(emp.position)) lastSupIdx = i;
    }
    if (lastSupIdx === -1 || lastSupIdx === section.members.length - 1) return -1;
    // Check if next person is NOT a supervisor
    const nextEmp = getEmp(section.members[lastSupIdx + 1]);
    if (!isSupervisorPosition(nextEmp.position)) return lastSupIdx;
    return -1;
  }, [section.members, getEmp]);

  const handleDragStart = (e: React.DragEvent, name: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ name, fromKey: section.key }));
  };

  const handleDrop = (e: React.DragEvent, beforeName: string | null, insertAfter: boolean) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      onMoveOperator(data.name, data.fromKey, section.key, beforeName, insertAfter);
    } catch {}
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    setDragOver(key);
  };

  return (
    <div className={`schedule-section${collapsed ? ' collapsed' : ''}`}>
      <div className="section-header" onClick={onToggle} style={{ borderLeft: `4px solid ${section.color}` }}>
        <span className="section-toggle">{collapsed ? '▶' : '▼'}</span>
        <span className="section-title">{section.label}</span>
        <span className="section-badge">{section.members.length}</span>
      </div>

      {!collapsed && (
        <div className="section-body">
          <div className="table-wrap">
            <table className="schedule-table">
              <thead>
                {countRows && (
                  <tr className="thead-counts">
                    <th className="col-name" />
                    {infoColumnVisible && <th className="col-info" />}
                    {days.map((day, di) => {
                      const c = countRows[di];
                      return (
                        <th key={day.d} className={`day-th${day.d === todayD ? ' today' : ''}`}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                            <span style={{ color: c.dayLow ? 'var(--c-red)' : 'var(--c-muted)', fontSize: 10 }}>{fmt(c.day)}</span>
                            <span style={{ color: c.nightLow ? 'var(--c-red)' : 'var(--c-muted)', fontSize: 10 }}>{fmt(c.night)}</span>
                            <span style={{ color: c.d12Low ? 'var(--c-red)' : 'var(--c-muted)', fontSize: 10 }}>{fmt(c.d12)}</span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="col-total">ИТОГО</th>
                  </tr>
                )}
                <tr>
                  <th className="col-name" />
                  {infoColumnVisible && <th className="col-info" />}
                  {days.map((day, di) => {
                    const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
                    const isToday = day.d === todayD;
                    const ds = dateStr(year, month, day.d);
                    const isSelected = ds === selectedDateStr;
                    const hasLow = countRows?.[di]?.anyLow;
                    return (
                      <th
                        key={day.d}
                        className={`day-th${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}${isSelected ? ' is-selected' : ''}`}
                        onClick={() => onSelectDate(ds, di)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div>{day.d}</div>
                        <div style={{ fontSize: 10 }}>{WEEKDAY_SHORT[day.date.getDay()]}</div>
                        {hasLow && <div className="date-red-dot" />}
                      </th>
                    );
                  })}
                  <th className="col-total">ИТОГО</th>
                </tr>
              </thead>
              <tbody>
                {section.members.map((name, memberIndex) => {
                  const emp = getEmp(name);
                  const totalHours = days.reduce((sum, day, di) => {
                    const type = getShiftForCell(name, di);
                    const key = `${name}:${dateStr(year, month, day.d)}`;
                    const ovr = overrides[key];
                    return sum + calcDayHours(type, ovr, name, employeeHoursSeed);
                  }, 0);

                  const isDismissed = !!dismissedEmployees[name];

                  return (
                    <React.Fragment key={name}>
                      {dividerAfterIndex === memberIndex - 1 && (
                        <tr>
                          <td colSpan={days.length + (infoColumnVisible ? 3 : 2)} className="section-divider" />
                        </tr>
                      )}
                      <tr
                        draggable={positionsMode}
                        onDragStart={positionsMode ? e => handleDragStart(e, name) : undefined}
                        onDragOver={positionsMode ? e => handleDragOver(e, name) : undefined}
                        onDrop={positionsMode ? e => handleDrop(e, name, false) : undefined}
                        onDragLeave={() => setDragOver(null)}
                        className={dragOver === name ? 'drop-zone' : ''}
                      >
                        <td className="col-name name-cell" style={isDismissed ? { opacity: 0.5 } : undefined}>
                          {positionsMode && <span style={{ cursor: 'grab', marginRight: 4 }}>⠿</span>}
                          <span style={{ cursor: isAdmin ? 'pointer' : 'default' }} onClick={() => isAdmin && onQuickEdit(name, dateStr(year, month, days[0].d), 0)}>
                            {name}
                          </span>
                          {isAdmin && (
                            <button
                              style={{ marginLeft: 4, fontSize: 10, opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                              onClick={e => { e.stopPropagation(); onOpenPattern(name); }}
                              title="Паттерн"
                            >
                              ⚙
                            </button>
                          )}
                        </td>
                        {infoColumnVisible && (
                          <td className="col-info info-cell">
                            <div style={{ fontSize: 11 }}>{emp.position}</div>
                            <div style={{ fontSize: 10, color: 'var(--c-muted)' }}>{emp.email}</div>
                            <div style={{ fontSize: 10, color: 'var(--c-muted)' }}>{emp.since}</div>
                          </td>
                        )}
                        {days.map((day, di) => {
                          const type = getShiftForCell(name, di);
                          const ds = dateStr(year, month, day.d);
                          const key = `${name}:${ds}`;
                          const ovr = overrides[key];
                          const cls = shiftCellClass(type);
                          const label = shiftCellLabel(type, ovr);
                          const isSelected = ds === selectedDateStr;
                          return (
                            <td
                              key={day.d}
                              className={`shift-cell ${cls}${isSelected ? ' is-selected' : ''}`}
                              onClick={() => {
                                onSelectDate(ds, di);
                                if (isAdmin) onQuickEdit(name, ds, di);
                              }}
                              title={`${name} — ${day.d} — ${SHIFT_DEFS[type]?.label ?? type}`}
                            >
                              <span className="shift-cell-label">{label}</span>
                            </td>
                          );
                        })}
                        <td className="col-total total-cell">{totalHours}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ScheduleSection);
