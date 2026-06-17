// Вся логика вычислений графика, вынесенная из UI.
// Соответствует v1: getShift, calcDayHours, swapBusyIntervals, swapCandidateOk и т.д.

import { SHIFT_DEFS, DEFAULT_HOURS, SWAP_MIN_REST, SWAP_BLOCK_DAY } from './shiftDefs';

// ── Типы ────────────────────────────────────────────────────────────────────────

export interface EmployeeData {
  name: string;
  email: string;
  position: string;
  since: string;
  hours?: number;
  dismissed?: string; // ISO date, последний рабочий день
}

export interface PatternEntry {
  pattern: string[];
  cycleStart: string; // 'YYYY-MM-DD'
  v?: number;
}

export interface ExtraEvent {
  type: string;
  hours: number;
  range?: string;
  swapWith?: string;
  win?: [number, number] | null;
  withLunch?: boolean;
}

export interface Override {
  type: string;
  note?: string;
  customHours?: number | null;
  extraEvents?: ExtraEvent[];
  editedBy?: string;
  editedAt?: string;
}

// ── Дата-утилиты ────────────────────────────────────────────────────────────────

export function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function localDs(date: Date): string {
  return dateStr(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function plusDays(ds: string, n: number): string {
  const d = parseLocalDate(ds);
  d.setDate(d.getDate() + n);
  return localDs(d);
}

export function getDaysInMonth(year: number, month: number) {
  const count = new Date(year, month, 0).getDate();
  const days = [];
  for (let d = 1; d <= count; d++) {
    const date = new Date(year, month - 1, d);
    days.push({
      d,
      day: date.toLocaleDateString('ru', { weekday: 'short' }),
      date,
    });
  }
  return days;
}

// ── Месячная навигация (воспроизводит AVAILABLE_MONTHS из v1) ─────────────────

const CYCLE_START = new Date(2026, 5, 1); // 1 июня 2026
const MONTHS_PAST = 3;
const MONTHS_AHEAD = 6;
const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                   'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function fromMonthIndex(idx: number) {
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function getAvailableMonths() {
  const now = new Date();
  const curIdx = monthIndex(now.getFullYear(), now.getMonth() + 1);
  const floorIdx = monthIndex(CYCLE_START.getFullYear(), CYCLE_START.getMonth() + 1);
  const startIdx = Math.max(floorIdx, curIdx - MONTHS_PAST);
  const endIdx   = Math.max(startIdx, curIdx + MONTHS_AHEAD);
  const out = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const { year, month } = fromMonthIndex(i);
    out.push({ year, month, label: `${RU_MONTHS[month - 1]} ${year}` });
  }
  return out;
}

export function getCurrentMonthClamped() {
  const now = new Date();
  const months = getAvailableMonths();
  const curIdx  = monthIndex(now.getFullYear(), now.getMonth() + 1);
  const firstIdx = monthIndex(months[0].year, months[0].month);
  const lastIdx  = monthIndex(months[months.length - 1].year, months[months.length - 1].month);
  return fromMonthIndex(Math.min(Math.max(curIdx, firstIdx), lastIdx));
}

// ── Разрешение смены ───────────────────────────────────────────────────────────

export function getPatternEntries(
  name: string,
  operatorPatterns: Record<string, PatternEntry | PatternEntry[]>
): PatternEntry[] {
  const raw = operatorPatterns[name];
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .filter(e => e && Array.isArray(e.pattern) && e.pattern.length && e.cycleStart)
    .map(e => (e.v && e.v >= 2 ? e : { ...e, cycleStart: plusDays(e.cycleStart, 1), v: 2 }))
    .sort((a, b) => (a.cycleStart < b.cycleStart ? -1 : 1));
}

export function getPatternShift(
  name: string,
  date: Date,
  operatorPatterns: Record<string, PatternEntry | PatternEntry[]>
): string | null {
  const entries = getPatternEntries(name, operatorPatterns);
  if (!entries.length) return null;
  const ds = localDs(date);
  let active: PatternEntry | null = null;
  for (const e of entries) { if (e.cycleStart <= ds) active = e; }
  if (!active) return null;
  const diffDays = Math.round((parseLocalDate(ds).getTime() - parseLocalDate(active.cycleStart).getTime()) / 86400000);
  const cycle = active.pattern.length;
  return active.pattern[((diffDays % cycle) + cycle) % cycle];
}

export function getShift(
  name: string,
  dayIndex: number,
  days: Array<{ d: number; date: Date }>,
  year: number,
  month: number,
  overrides: Record<string, Override>,
  dismissedEmployees: Record<string, string>,
  operatorPatterns: Record<string, PatternEntry | PatternEntry[]>,
  operatorBaseShifts: Record<string, (date: Date) => string>
): string {
  const key = `${name}:${dateStr(year, month, days[dayIndex].d)}`;
  if (overrides[key]) return overrides[key].type;

  const dis = dismissedEmployees[name];
  if (dis && dateStr(year, month, days[dayIndex].d) > dis) return 'dismissed';

  const patternShift = getPatternShift(name, days[dayIndex].date, operatorPatterns);
  if (patternShift !== null) return patternShift;

  const fn = operatorBaseShifts[name];
  return fn ? fn(days[dayIndex].date) : 'off';
}

// ── Часы ───────────────────────────────────────────────────────────────────────

export function getHours(type: string): number {
  return DEFAULT_HOURS[type] ?? 0;
}

// События, которые добавляют часы (а не вычитают). Всё остальное — минус.
const PLUS_EVENT_TYPES = new Set([
  'extra_critical', 'extra_vacation_cover', 'extra_sick_cover',
  'extra_swap_take', 'extra_org_plus', 'extra_sick_paid',
]);

export function calcDayHours(
  type: string,
  override: Override | undefined,
  name: string,
  employeeHoursSeed: Record<string, number>
): number {
  if (!type || type === 'off' || type === 'vacation' || type === 'dismissed') return 0;
  if (type === 'sick') {
    const paid = (override?.extraEvents || []).find(e => e.type === 'extra_sick_paid' && e.hours > 0);
    return paid ? paid.hours : 0;
  }

  const def = SHIFT_DEFS[type];

  let h: number;
  if (override?.customHours != null && Number.isFinite(override.customHours)) {
    h = override.customHours;
  } else {
    const ph = employeeHoursSeed[name];
    // Персональные часы применяются только к сменам с окном (как в v1).
    h = (ph !== undefined && def?.window) ? ph : getHours(type);
  }

  const events = (override?.extraEvents || []).filter(e => e.hours > 0);
  if (events.length) {
    const isExtra = !!def?.isExtra;
    const takes = events.filter(e => e.type === 'extra_swap_take');
    if (isExtra && takes.length) {
      // Доп. смена, полученная обменом: база не считается, только полученные часы + прочие события.
      h = takes.reduce((s, e) => s + e.hours, 0);
      events.forEach(e => {
        if (e.type === 'extra_swap_take') return;
        h += PLUS_EVENT_TYPES.has(e.type) ? e.hours : -e.hours;
      });
    } else {
      events.forEach(e => { h += PLUS_EVENT_TYPES.has(e.type) ? e.hours : -e.hours; });
    }
  }
  return Math.max(0, h);
}

// ── Swap аннотация ─────────────────────────────────────────────────────────────
// «Отдал → кому» / «Забрал ← у кого», со всеми событиями и пометками про обед.

export function swapAnnotation(override: Override | undefined): string {
  const parts: string[] = [];
  (override?.extraEvents || []).forEach(e => {
    const lunchGive = e.withLunch === true ? ' (с обедом)' : (e.withLunch === false ? ' (обед себе)' : '');
    const lunchTake = e.withLunch === true ? ' (с обедом)' : (e.withLunch === false ? ' (без обеда)' : '');
    const range = e.range ? ` ${e.range}` : '';
    if (e.type === 'loss_swap_give' && e.swapWith) parts.push(`🔄 Отдал ${e.hours}ч${range} → ${e.swapWith}${lunchGive}`);
    else if (e.type === 'extra_swap_take' && e.swapWith) parts.push(`🔄 Забрал ${e.hours}ч${range} ← ${e.swapWith}${lunchTake}`);
  });
  return parts.join(' · ');
}

// ── Swap: группа оператора ─────────────────────────────────────────────────────

export function swapGroupOf(
  name: string,
  getEmpFn: (n: string) => { position: string }
): 'support' | 'supervisor' | null {
  const p = getEmpFn(name).position.toLowerCase();
  if (p === 'support' || p === 'vip')        return 'support';
  if (p === 'supervisor' || p === 'vip sup') return 'supervisor';
  return null;
}

// ── Swap: смена оператора на произвольную дату ─────────────────────────────────

export function swapShiftOnDate(
  name: string,
  date: Date,
  year: number,
  month: number,
  days: Array<{ d: number; date: Date }>,
  overrides: Record<string, Override>,
  dismissedEmployees: Record<string, string>,
  operatorPatterns: Record<string, PatternEntry | PatternEntry[]>,
  operatorBaseShifts: Record<string, (date: Date) => string>
): string {
  if (date.getFullYear() === year && date.getMonth() + 1 === month) {
    const dayIndex = date.getDate() - 1;
    return getShift(name, dayIndex, days, year, month, overrides, dismissedEmployees, operatorPatterns, operatorBaseShifts);
  }
  const dis = dismissedEmployees[name];
  if (dis && localDs(date) > dis) return 'dismissed';
  const p = getPatternShift(name, date, operatorPatterns);
  if (p !== null) return p;
  const fn = operatorBaseShifts[name];
  return fn ? fn(date) : 'off';
}

// ── Swap: интервалы занятости ──────────────────────────────────────────────────

export function swapBusyIntervals(
  name: string,
  baseDate: Date,
  year: number,
  month: number,
  days: Array<{ d: number; date: Date }>,
  overrides: Record<string, Override>,
  dismissedEmployees: Record<string, string>,
  operatorPatterns: Record<string, PatternEntry | PatternEntry[]>,
  operatorBaseShifts: Record<string, (date: Date) => string>
): Array<[number, number]> {
  const res: Array<[number, number]> = [];
  for (let off = -1; off <= 1; off++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + off);
    const t = swapShiftOnDate(name, d, year, month, days, overrides, dismissedEmployees, operatorPatterns, operatorBaseShifts);

    const baseDs = dateStr(year, month, baseDate.getDate());
    let ovr: Override | undefined;
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      ovr = overrides[`${name}:${localDs(d)}`];
    }

    if (t === 'nk') { res.push([off * 24, off * 24 + 24]); continue; }

    const takeWins = (ovr?.extraEvents || [])
      .filter(e => e.type === 'extra_swap_take' && Array.isArray(e.win))
      .map(e => e.win as [number, number]);

    if (t && t.startsWith('extra_') && takeWins.length) {
      takeWins.forEach(w => res.push([off * 24 + w[0], off * 24 + w[1]]));
      continue;
    }

    const def = SHIFT_DEFS[t];
    if (def?.window) res.push([off * 24 + def.window[0], off * 24 + def.window[1]]);
    takeWins.forEach(w => res.push([off * 24 + w[0], off * 24 + w[1]]));
  }
  return res;
}

// ── Swap: остаток часов для отдачи ─────────────────────────────────────────────

export function swapRemainingHours(
  name: string,
  dNum: number,
  type: string,
  year: number,
  month: number,
  overrides: Record<string, Override>,
  employeeHoursSeed: Record<string, number>
): number {
  const key = `${name}:${dateStr(year, month, dNum)}`;
  const ovr = overrides[key];
  let base = ovr?.customHours != null ? ovr.customHours : (getHours(type) || 0);
  let minus = 0;
  (ovr?.extraEvents || []).forEach(ev => {
    if (ev.hours > 0 && ev.type.startsWith('loss_')) minus += ev.hours;
  });
  return Math.max(0, base - minus);
}

// ── Swap: проверка получателя ──────────────────────────────────────────────────

export function swapCandidateOk(
  cand: string,
  giver: string,
  dateObj: Date,
  win: [number, number],
  shiftType: string,
  year: number,
  month: number,
  days: Array<{ d: number; date: Date }>,
  overrides: Record<string, Override>,
  dismissedEmployees: Record<string, string>,
  operatorPatterns: Record<string, PatternEntry | PatternEntry[]>,
  operatorBaseShifts: Record<string, (date: Date) => string>,
  getEmpFn: (n: string) => { position: string }
): boolean {
  if (cand === giver) return false;
  const g1 = swapGroupOf(giver, getEmpFn);
  const g2 = swapGroupOf(cand, getEmpFn);
  if (!g1 || g1 !== g2) return false;

  const dayType = swapShiftOnDate(cand, dateObj, year, month, days, overrides, dismissedEmployees, operatorPatterns, operatorBaseShifts);
  if (SWAP_BLOCK_DAY.has(dayType)) return false;

  const prev = new Date(dateObj);
  prev.setDate(prev.getDate() - 1);
  const prevType = swapShiftOnDate(cand, prev, year, month, days, overrides, dismissedEmployees, operatorPatterns, operatorBaseShifts);
  const isNightShift = (t: string) => SHIFT_DEFS[t]?.isNight ?? false;
  if (isNightShift(prevType) && !isNightShift(shiftType)) return false;

  const intervals = swapBusyIntervals(cand, dateObj, year, month, days, overrides, dismissedEmployees, operatorPatterns, operatorBaseShifts);
  const takeLen = win[1] - win[0];
  for (const [s, e] of intervals) {
    const rest     = (e + SWAP_MIN_REST <= win[0]) || (win[1] + SWAP_MIN_REST <= s);
    const adjacent = ((e === win[0]) || (win[1] === s)) && takeLen <= SWAP_MIN_REST;
    if (!(rest || adjacent)) return false;
  }
  return true;
}

// ── Форматирование времени swap ─────────────────────────────────────────────────

export function swapFmtH(h: number): string {
  return `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;
}

export function swapFmtRange(s: number, e: number): string {
  return `${swapFmtH(s)}-${swapFmtH(e)}${e > 24 ? ' (+1д)' : ''}`;
}

// ── Цвета ячеек (CSS-переменные как в v1) ──────────────────────────────────────

export function shiftCellClass(type: string): string {
  if (!type) return '';
  if (type === 'morning')    return 'cell-morning';
  if (type === 'evening')    return 'cell-evening';
  if (type === 'shift1200')  return 'cell-1200';
  if (type === 'extra_morning' || type === 'extra_evening' || type === 'extra_1200') return 'cell-extra-regular';
  if (type === 'vip_evening')  return 'cell-vip-day';
  if (type === 'vip_morning')  return 'cell-vip-night';
  if (type === 'vip_1200')     return 'cell-vip-1200';
  if (type.startsWith('extra_vip')) return 'cell-extra-vip';
  if (type === 'super_day')  return 'cell-super-day';
  if (type === 'super_night')return 'cell-super-night';
  if (type === 'super_day8') return 'cell-super-day8';
  if (type.startsWith('extra_sup')) return 'cell-extra-sup';
  if (type === 'work8')      return 'cell-work8';
  if (type === 'vacation')   return 'cell-vacation';
  if (type === 'sick')       return 'cell-sick';
  if (type === 'birthday')   return 'cell-birthday';
  if (type === 'nk')         return 'cell-nk';
  if (type === 'dismissed')  return 'cell-dismissed';
  return 'cell-off';
}

// ── Ярлык смены для отображения в ячейке ───────────────────────────────────────

export function shiftCellLabel(
  type: string,
  override: Override | undefined,
  name: string,
  employeeHoursSeed: Record<string, number>
): string {
  // Воспроизводит v1: в ячейке — число часов (или спецсимвол), а не текст смены.
  if (type === 'off') return '—';
  if (type === 'birthday') return '🎂';
  if (type === 'vacation') return '✈';
  if (type === 'nk') return 'НК';
  if (type === 'dismissed') return '🚫';
  if (type === 'sick') {
    const paidSick = override?.extraEvents?.find(e => e.type === 'extra_sick_paid' && e.hours > 0);
    return paidSick ? '🤒💰' : '🤒';
  }
  if (override?.customHours === 0) return '🚫';
  const total = calcDayHours(type, override, name, employeeHoursSeed);
  return total > 0 ? String(total) : '0';
}
