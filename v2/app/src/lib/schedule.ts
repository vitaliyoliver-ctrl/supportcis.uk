// Логика вычисления смены — чистые функции, без хардкода.
// Всё, что раньше жило в BASE_PATTERNS/getSuperTeamShift/EMPLOYEES, теперь в БД.

import type { Employee, ShiftPattern, ScheduleOverride } from './types';

export function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function getDaysInMonth(year: number, month: number): Date[] {
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, month - 1, i + 1));
}

// Вычислить тип смены для сотрудника на дату.
// Приоритет: override > паттерн > 'off'
export function resolveShift(
  employee: Employee,
  dateIso: string,
  overrideMap: Map<string, ScheduleOverride>,
  patterns: ShiftPattern[],
): string {
  const key = `${employee.id}:${dateIso}`;
  const ov = overrideMap.get(key);
  if (ov) return ov.shiftKey;

  if (employee.dismissedAt && dateIso > employee.dismissedAt) return 'dismissed';

  const activePattern = patterns
    .filter(p => p.employeeId === employee.id && p.cycleStart <= dateIso)
    .sort((a, b) => (a.cycleStart > b.cycleStart ? -1 : 1))[0];

  if (activePattern) {
    const diff = daysBetween(activePattern.cycleStart, dateIso);
    const cycle = activePattern.pattern.length;
    return activePattern.pattern[((diff % cycle) + cycle) % cycle];
  }

  return 'off';
}

// Построить Map<"employeeId:dateIso", Override> для быстрого lookup
export function buildOverrideMap(overrides: ScheduleOverride[]): Map<string, ScheduleOverride> {
  return new Map(overrides.map(o => [`${o.employeeId}:${o.date}`, o]));
}

// Сколько часов оплачивается за смену (учитывает customHours и extraEvents)
export function calcDayHours(
  shiftKey: string,
  shiftHours: number,       // из shift_types.hours
  override: ScheduleOverride | undefined,
  employeeHours: number | null,
): number {
  if (!override) {
    return employeeHours !== null ? Math.min(employeeHours, shiftHours) : shiftHours;
  }

  const base = override.customHours
    ?? (employeeHours !== null ? Math.min(employeeHours, shiftHours) : shiftHours);

  const extra = override.extraEvents.reduce((sum, ev) => sum + (ev.hours ?? 0), 0);
  return base + extra;
}
