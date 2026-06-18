import React, { useMemo } from 'react';
import type { SectionDef } from '@/lib/useScheduleState';
import type { Override } from '@/lib/scheduleLogic';
import { calcDayHours } from '@/lib/scheduleLogic';
import { SHIFT_DEFS } from '@/lib/shiftDefs';

interface StatsBarProps {
  sections: SectionDef[];
  getShiftForCell: (name: string, di: number) => string;
  days: Array<{ d: number; date: Date }>;
  year: number;
  month: number;
  overrides: Record<string, Override>;
  employeeHoursSeed: Record<string, number>;
  getEmp: (name: string) => { position: string; hours?: number };
}

function isSupervisorPosition(position: string): boolean {
  return position.includes('Supervisor') || position.includes('VIP Sup');
}

const StatsBar: React.FC<StatsBarProps> = ({
  sections,
  getShiftForCell,
  days,
  year,
  month,
  overrides,
  employeeHoursSeed,
  getEmp,
}) => {
  const stats = useMemo(() => {
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
    const currentHour = now.getHours();

    const regularSection = sections.find(s => s.key === 'regular_support');
    const vipSection = sections.find(s => s.key === 'vip_support');

    let regularCount = 0;
    let vipCount = 0;

    if (isCurrentMonth) {
      const todayIndex = now.getDate() - 1;
      const yesterdayIndex = todayIndex - 1;

      const calcOnline = (members: string[]): { count: number; names: string[] } => {
        let count = 0;
        const names: string[] = [];
        for (const name of members) {
          const type = getShiftForCell(name, todayIndex);
          const def = SHIFT_DEFS[type];
          if (!def?.window) continue;
          const [start, end] = def.window;
          if (currentHour >= start && currentHour < end) {
            const key = `${name}:${year}-${String(month).padStart(2, '0')}-${String(days[todayIndex].d).padStart(2, '0')}`;
            const ovr = overrides[key];
            const h = calcDayHours(type, ovr, name, employeeHoursSeed);
            count += h / 11;
            names.push(name);
          }
          if (end > 24 && currentHour < end - 24 && yesterdayIndex >= 0) {
            const yType = getShiftForCell(name, yesterdayIndex);
            const yDef = SHIFT_DEFS[yType];
            if (yDef?.window && yDef.window[1] > 24 && currentHour < yDef.window[1] - 24) {
              const d = days[yesterdayIndex].d;
              const key = `${name}:${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const ovr = overrides[key];
              const h = calcDayHours(yType, ovr, name, employeeHoursSeed);
              count += h / 11;
              if (!names.includes(name)) names.push(name);
            }
          }
        }
        return { count, names };
      };

      const regResult = regularSection ? calcOnline(regularSection.members) : { count: 0, names: [] as string[] };
      const vipResult = vipSection ? calcOnline(vipSection.members) : { count: 0, names: [] as string[] };
      regularCount = regResult.count;
      vipCount = vipResult.count;
      const onlineNames = [...regResult.names, ...vipResult.names];

      const regularOps = (regularSection?.members ?? []).filter(n => !isSupervisorPosition(getEmp(n).position)).length;
      const vipOps = (vipSection?.members ?? []).filter(n => !isSupervisorPosition(getEmp(n).position)).length;
      const total = sections.flatMap(s => s.members).length;
      const onlineTotal = regularCount + vipCount;

      return { regularOps, vipOps, onlineTotal, total, isCurrentMonth, onlineNames };
    }

    // Размеры отделов — только операторы (без супервайзеров), как в v1.
    const regularOps = (regularSection?.members ?? []).filter(n => !isSupervisorPosition(getEmp(n).position)).length;
    const vipOps = (vipSection?.members ?? []).filter(n => !isSupervisorPosition(getEmp(n).position)).length;
    const total = sections.flatMap(s => s.members).length;
    const onlineTotal = regularCount + vipCount;

    return { regularOps, vipOps, onlineTotal, total, isCurrentMonth, onlineNames: [] as string[] };
  }, [sections, getShiftForCell, days, year, month, overrides, employeeHoursSeed, getEmp]);

  const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);

  return (
    <div className="stats-row">
      <div className="stat-card stat-card-tooltip">
        <div className="stat-label">Операторов онлайн</div>
        <div className="stat-val">{stats.isCurrentMonth ? fmt(stats.onlineTotal) : '—'}</div>
        <div className="stat-sub">сейчас на смене</div>
        {stats.isCurrentMonth && stats.onlineNames.length > 0 && (
          <div className="stat-tooltip-box">
            <div className="stat-tooltip-title">Сейчас онлайн</div>
            {stats.onlineNames.map(n => (
              <div key={n} className="stat-tooltip-name">{n}</div>
            ))}
          </div>
        )}
      </div>
      <div className="stat-card">
        <div className="stat-label">Regular Support</div>
        <div className="stat-val">{stats.regularOps}</div>
        <div className="stat-sub">операторов в отделе</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">VIP Support</div>
        <div className="stat-val">{stats.vipOps}</div>
        <div className="stat-sub">операторов в отделе</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Всего персонала</div>
        <div className="stat-val">{stats.total}</div>
        <div className="stat-sub">сотрудников в системе</div>
      </div>
    </div>
  );
};

export default React.memo(StatsBar);
