// Seed данные проекта НК (NK) — порт из support/schedule/schedule-nc/index.html.
// Те же типы смен, что и у SG (morning=09–21 день, evening=21–09 ночь, nk, off…),
// отличаются только состав, секции и паттерны.

const CYCLE_START = new Date(2026, 5, 1); // 1 июня 2026 — общая точка отсчёта паттернов

export const NK_EMPLOYEES_SEED: Record<string, { email: string; position: string; since: string }> = {
  'Irving':  { email: 'ruslan.irving@velvix.org',    position: 'Supervisor NC', since: '2024-07-22' },
  'Max':     { email: 'maksym.max@velvix.org',       position: 'Supervisor NC', since: '2023-03-30' },
  'Joseph':  { email: 'oleh.vy@velvix.org',          position: 'Support NC',    since: '2025-10-20' },
  'Meadow':  { email: 'assel.meadow@velvix.org',     position: 'Support NC',    since: '2024-08-08' },
  'Frey':    { email: 'alexandra.frey@velvix.org',   position: 'Support NC',    since: '2025-07-29' },
  'Luciana': { email: 'ludmila.luciana@velvix.org',  position: 'Support NC',    since: '2024-04-15' },
  'Debra':   { email: 'katsiaryna.yo@velvix.org',    position: 'Support NC',    since: '2026-01-26' },
  'Evelyn':  { email: 'olga.evelyn@velvix.org',      position: 'Support NC',    since: '2024-04-08' },
  'Mike':    { email: 'stanislav.mike@velvix.org',   position: 'Support (SG)',  since: '2023-08-28' },
};

export const NK_SECTIONS_SEED = [
  { key: 'supervisors_nk', label: 'Supervisors',    color: 'blue',   members: ['Irving', 'Max'] },
  { key: 'support_nk',     label: 'Support NC',     color: 'green',  members: ['Joseph', 'Meadow', 'Frey', 'Luciana', 'Debra', 'Evelyn'] },
  { key: 'temp_support',   label: 'Временные (SG)', color: 'orange', members: ['Mike'] },
];

// У НК нет персональных переопределений часов.
export const NK_OPERATOR_HOURS_SEED: Record<string, number> = {};

// ── Базовые паттерны НК ───────────────────────────────────────────────────────
const NK_BASE_PATTERNS: Record<string, string[]> = {
  // Супервайзеры: 2/2 ночная (21–09 = evening)
  'Irving':  ['evening', 'evening', 'off', 'off'],
  'Max':     ['off', 'off', 'evening', 'evening'],
  // Операторы: чередование день/ночь
  'Joseph':  ['evening', 'off', 'off', 'morning', 'morning', 'off', 'off', 'evening'],
  'Meadow':  ['off', 'morning', 'morning', 'off', 'off', 'evening', 'evening', 'off'],
  'Frey':    ['off', 'morning', 'morning', 'off', 'off', 'evening', 'evening', 'off'],
  'Luciana': ['off', 'morning', 'morning', 'off', 'off', 'morning', 'morning', 'off'],
  'Debra':   ['morning', 'off', 'off', 'evening', 'evening', 'off', 'off', 'morning'],
  'Evelyn':  ['off', 'off', 'morning', 'morning', 'off', 'off', 'evening', 'evening'],
  // Временный сотрудник СГ
  'Mike':    ['evening', 'off', 'off', 'morning', 'morning', 'off', 'off', 'evening'],
};

function makeCycleFn(pattern: string[]) {
  return (date: Date) => {
    const diff = Math.round((date.getTime() - CYCLE_START.getTime()) / 86400000);
    const len = pattern.length;
    return pattern[((diff % len) + len) % len];
  };
}

export const NK_OPERATOR_BASE_SHIFTS: Record<string, (date: Date) => string> = {};
Object.entries(NK_BASE_PATTERNS).forEach(([name, pattern]) => {
  NK_OPERATOR_BASE_SHIFTS[name] = makeCycleFn(pattern);
});
