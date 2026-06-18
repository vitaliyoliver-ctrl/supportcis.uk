import React, { useMemo, useRef } from 'react';
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
  onRemoveMember?: (name: string, sectionKey: string) => void;
}

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const COUNT_SECTION_KEYS = new Set(['regular_support', 'vip_support']);

// Строки счётчиков по сменам — отдельно для regular и vip (как в v1).
const SHIFT_ROWS_REG = [
  { types: ['morning', 'extra_morning'],   label: '09–21', color: '#60a5fa', min: MIN_STAFF.day },
  { types: ['evening', 'extra_evening'],   label: '21–09', color: '#818cf8', min: MIN_STAFF.night },
  { types: ['shift1200', 'extra_1200'],    label: '12–00', color: '#f59e0b', min: MIN_STAFF.d12 },
];
const SHIFT_ROWS_VIP = [
  { types: ['vip_evening', 'extra_vip_evening'], label: '09–21', color: '#2dd4bf', min: MIN_STAFF.day },
  { types: ['vip_morning', 'extra_vip_morning'], label: '21–09', color: '#e879f9', min: MIN_STAFF.night },
  { types: ['vip_1200', 'extra_vip_1200'],       label: '12–00', color: '#a3e635', min: MIN_STAFF.d12 },
];

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
  onRemoveMember,
}) => {
  // Drag refs — no state updates during drag to prevent flickering
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const allMembers = useMemo(() => allSections.flatMap(s => s.members), [allSections]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayD = isCurrentMonth ? today.getDate() : -1;

  const isCountSection = COUNT_SECTION_KEYS.has(section.key);
  const shiftRows = section.key === 'vip_support' ? SHIFT_ROWS_VIP : SHIFT_ROWS_REG;

  // Count rows data: для каждой строки смены (09–21/21–09/12–00) — дробный
  // headcount по дням (суммарные часы / 11), как в v1.
  const countRows = useMemo(() => {
    if (!isCountSection) return null;
    return shiftRows.map(row => {
      const perDay = days.map((day, di) => {
        let sum = 0;
        for (const name of allMembers) {
          const type = getShiftForCell(name, di);
          if (!row.types.includes(type)) continue;
          const key = `${name}:${dateStr(year, month, day.d)}`;
          sum += calcDayHours(type, overrides[key], name, employeeHoursSeed);
        }
        const count = Math.round((sum / 11) * 10) / 10;
        return { count, low: count < row.min };
      });
      return { ...row, perDay };
    });
  }, [isCountSection, shiftRows, allMembers, days, year, month, overrides, employeeHoursSeed, getShiftForCell]);

  // Красная точка на дате, если днём/ночью недобор (по числу людей).
  const dayLowFlags = useMemo(() => {
    if (!isCountSection) return null;
    const dayTypes = section.key === 'vip_support' ? ['vip_evening', 'extra_vip_evening'] : ['morning', 'extra_morning'];
    const nightTypes = section.key === 'vip_support' ? ['vip_morning', 'extra_vip_morning'] : ['evening', 'extra_evening'];
    return days.map((_, di) => {
      const dayCount = allMembers.filter(n => dayTypes.includes(getShiftForCell(n, di))).length;
      const nightCount = allMembers.filter(n => nightTypes.includes(getShiftForCell(n, di))).length;
      return dayCount < MIN_STAFF.day || nightCount < MIN_STAFF.night;
    });
  }, [isCountSection, section.key, allMembers, days, getShiftForCell]);

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

  const clearDragStyles = () => {
    rowRefs.current.forEach(el => el.classList.remove('drag-over-top'));
  };

  const handleDragStart = (e: React.DragEvent, name: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ name, fromKey: section.key }));
    (e.currentTarget as HTMLElement).style.opacity = '0.4';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '';
    clearDragStyles();
  };

  const handleDragOver = (e: React.DragEvent, name: string) => {
    e.preventDefault();
    clearDragStyles();
    rowRefs.current.get(name)?.classList.add('drag-over-top');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('drag-over-top');
  };

  const handleDrop = (e: React.DragEvent, beforeName: string | null, insertAfter: boolean) => {
    e.preventDefault();
    clearDragStyles();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      onMoveOperator(data.name, data.fromKey, section.key, beforeName, insertAfter);
    } catch {}
  };

  return (
    <div className={`schedule-section${collapsed ? ' collapsed' : ''}`}>
      <div className="section-header" onClick={onToggle} style={{ borderLeft: `4px solid ${section.color}` }}>
        <span className="section-toggle">{collapsed ? '▶' : '▼'}</span>
        <span className="section-title">{section.label}</span>
        <span className="section-badge">{section.members.length} чел.</span>
      </div>

      {!collapsed && (
        <div className="section-body">
          <div className="table-wrap">
            <table className="schedule-table">
              <thead>
                {countRows && countRows.map(row => (
                  <tr className="thead-counts" key={row.label + row.color}>
                    <th className="col-name" style={{ textAlign: 'left', paddingLeft: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: row.color, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: 9, color: row.color, fontWeight: 600 }}>{row.label}</span>
                      </span>
                    </th>
                    {infoColumnVisible && <th className="col-info" />}
                    {days.map((day, di) => {
                      const c = row.perDay[di];
                      return (
                        <th key={day.d} className={`day-th${day.d === todayD ? ' today' : ''}`} style={c.low ? { background: 'rgba(248,113,113,0.2)' } : undefined}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: c.low ? '#f87171' : row.color }}>{fmt(c.count)}</span>
                        </th>
                      );
                    })}
                    <th className="col-total" />
                  </tr>
                ))}
                <tr>
                  <th className="col-name" />
                  {infoColumnVisible && <th className="col-info" />}
                  {days.map((day, di) => {
                    const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
                    const isToday = day.d === todayD;
                    const ds = dateStr(year, month, day.d);
                    const isSelected = ds === selectedDateStr;
                    const hasLow = dayLowFlags?.[di];
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
                          <td colSpan={days.length + (infoColumnVisible ? 3 : 2)} className="section-divider-cell">ОПЕРАТОРЫ</td>
                        </tr>
                      )}
                      <tr
                        ref={el => { if (el) rowRefs.current.set(name, el); }}
                        draggable={positionsMode}
                        onDragStart={positionsMode ? e => handleDragStart(e, name) : undefined}
                        onDragEnd={positionsMode ? handleDragEnd : undefined}
                        onDragOver={positionsMode ? e => handleDragOver(e, name) : undefined}
                        onDragLeave={positionsMode ? handleDragLeave : undefined}
                        onDrop={positionsMode ? e => handleDrop(e, name, false) : undefined}
                      >
                        <td className="col-name name-cell" style={isDismissed ? { opacity: 0.5 } : undefined}>
                          {positionsMode && <span style={{ cursor: 'grab', marginRight: 4 }}>⠿</span>}
                          <span style={{ cursor: isAdmin ? 'pointer' : 'default' }} onClick={() => isAdmin && onQuickEdit(name, dateStr(year, month, days[0].d), 0)}>
                            {name}
                          </span>
                          {isAdmin && !positionsMode && (
                            <button
                              style={{ marginLeft: 4, fontSize: 10, opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                              onClick={e => { e.stopPropagation(); onOpenPattern(name); }}
                              title="Паттерн"
                            >
                              ⚙
                            </button>
                          )}
                          {positionsMode && onRemoveMember && (
                            <button
                              style={{ marginLeft: 4, fontSize: 10, opacity: 0.5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#f87171' }}
                              onClick={e => { e.stopPropagation(); onRemoveMember(name, section.key); }}
                              title="Убрать из секции"
                            >
                              ✕
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
                          const EXTRA_SHIFT_TYPES = new Set(['extra_morning','extra_evening','extra_1200','extra_vip_morning','extra_vip_evening','extra_vip_1200','extra_sup_day','extra_sup_night','extra_vacation_cover','extra_sick_cover','extra_org_plus','extra_critical']);
                          const hasExtra = !!(ovr?.extraEvents?.some(e => EXTRA_SHIFT_TYPES.has(e.type)));
                          const label = shiftCellLabel(type, ovr, name, employeeHoursSeed);
                          const isSelected = ds === selectedDateStr;
                          return (
                            <td
                              key={day.d}
                              className={`shift-cell ${cls}${isSelected ? ' is-selected' : ''}${hasExtra ? ' cell-has-extra' : ''}`}
                              onClick={() => {
                                if (isAdmin) onQuickEdit(name, ds, di);
                                else onSelectDate(ds, di);
                              }}
                              title={`${name} — ${day.d} — ${SHIFT_DEFS[type]?.label ?? type}`}
                            >
                              <span className="shift-cell-label">{label}</span>
                              {ovr?.extraEvents?.some(e => e.type === 'extra_swap_take' || e.type === 'loss_swap_give') && (
                                <span className="cell-swap-dot" />
                              )}
                              {!!(ovr?.note || (ovr?.extraEvents?.length && !ovr.extraEvents.some(e => e.type === 'extra_swap_take' || e.type === 'loss_swap_give'))) && (
                                <span className="cell-note-dot" />
                              )}
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
