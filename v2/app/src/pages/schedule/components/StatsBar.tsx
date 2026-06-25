import React, { useMemo } from 'react';
import type { SectionDef } from '@/lib/useScheduleState';
import type { Override } from '@/lib/scheduleLogic';
import type { StatCard } from '@/lib/projects';
import { calcDayHours } from '@/lib/scheduleLogic';
import { SHIFT_DEFS } from '@/lib/shiftDefs';

interface StatsBarProps {
  sections: SectionDef[];
  statCards: StatCard[];
  onlineOperatorsOnly: boolean;
  getShiftForCell: (name: string, di: number) => string;
  days: Array<{ d: number; date: Date }>;
  year: number;
  month: number;
  overrides: Record<string, Override>;
  employeeHoursSeed: Record<string, number>;
  getEmp: (name: string) => { position: string; hours?: number };
}

function isOperatorPosition(position: string): boolean {
  // Оператор = саппорт-уровень, не супервайзер. По вхождению подстроки, чтобы
  // работали и SG («Support», «VIP»), и НК («Support NC», «Support (SG)»).
  const p = position.toLowerCase();
  if (p.includes('supervisor') || p.includes('vip sup')) return false;
  return p.includes('support') || p.includes('vip');
}

const StatsBar: React.FC<StatsBarProps> = ({
  sections,
  statCards,
  onlineOperatorsOnly,
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
    const pad = (n: number) => String(n).padStart(2, '0');

    // Все участники нетемповых секций (временные не считаются в итогах/онлайне).
    const allMembers = sections.filter(s => !s.isTemp).flatMap(s => s.members);
    const total = allMembers.length;

    // Карточки-отделы: число людей в указанных секциях.
    const cardCounts = statCards.map(card => {
      const members = sections.filter(s => card.sectionKeys.includes(s.key)).flatMap(s => s.members);
      const count = card.operatorsOnly
        ? members.filter(n => isOperatorPosition(getEmp(n).position)).length
        : members.length;
      return { label: card.label, count, sub: card.operatorsOnly ? 'операторов в отделе' : 'человек в отделе' };
    });

    let onlineTotal = 0;
    const onlineNames: string[] = [];
    if (isCurrentMonth) {
      const todayIndex = now.getDate() - 1;
      const yesterdayIndex = todayIndex - 1;
      for (const name of allMembers) {
        if (onlineOperatorsOnly && !isOperatorPosition(getEmp(name).position)) continue;
        const type = getShiftForCell(name, todayIndex);
        const def = SHIFT_DEFS[type];
        if (!def?.window) continue;
        const [start, end] = def.window;
        if (currentHour >= start && currentHour < end) {
          const key = `${name}:${year}-${pad(month)}-${pad(days[todayIndex].d)}`;
          onlineTotal += calcDayHours(type, overrides[key], name, employeeHoursSeed) / 11;
          onlineNames.push(name);
        }
        if (end > 24 && currentHour < end - 24 && yesterdayIndex >= 0) {
          const yType = getShiftForCell(name, yesterdayIndex);
          const yDef = SHIFT_DEFS[yType];
          if (yDef?.window && yDef.window[1] > 24 && currentHour < yDef.window[1] - 24) {
            const key = `${name}:${year}-${pad(month)}-${pad(days[yesterdayIndex].d)}`;
            onlineTotal += calcDayHours(yType, overrides[key], name, employeeHoursSeed) / 11;
            if (!onlineNames.includes(name)) onlineNames.push(name);
          }
        }
      }
    }

    return { cardCounts, total, onlineTotal, isCurrentMonth, onlineNames };
  }, [sections, statCards, onlineOperatorsOnly, getShiftForCell, days, year, month, overrides, employeeHoursSeed, getEmp]);

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
      {stats.cardCounts.map(c => (
        <div className="stat-card" key={c.label}>
          <div className="stat-label">{c.label}</div>
          <div className="stat-val">{c.count}</div>
          <div className="stat-sub">{c.sub}</div>
        </div>
      ))}
      <div className="stat-card">
        <div className="stat-label">Всего персонала</div>
        <div className="stat-val">{stats.total}</div>
        <div className="stat-sub">сотрудников в системе</div>
      </div>
    </div>
  );
};

export default React.memo(StatsBar);
