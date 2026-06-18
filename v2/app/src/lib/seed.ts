// Seed данные: EMPLOYEES, BASE_PATTERNS, SECTIONS из v1.
// В v2 это временный слой — после применения SQL-миграции 002_seed.sql
// все эти данные приходят из API и этот файл удаляется.

const CYCLE_START = new Date(2026, 5, 1);

// ── Сотрудники (EMPLOYEES из v1) ──────────────────────────────────────────────

export const EMPLOYEES_SEED: Record<string, { email: string; position: string; since: string }> = {
  'Oliver':    { email: 'vitaliy.oliver@velvix.org',        position: 'Head',        since: '2022-10-24' },
  'Jordan':    { email: 'ayman.jordan@velvix.org',          position: 'TL',          since: '2021-08-24' },
  'Naomi':     { email: 'nataliia.naomi@velvix.org',        position: 'TL',          since: '2023-04-27' },
  'Matthew':   { email: 'viktor.matthew@velvix.org',        position: 'TL',          since: '2023-03-30' },
  'Robert':    { email: 'adil.ab@velvix.org',               position: 'Support',     since: '2026-01-12' },
  'Reed':      { email: 'vladyslav.reed@velvix.org',        position: 'Complaints',  since: '2024-03-25' },
  'Jayden':    { email: 'ilia.jayden@velvix.org',           position: 'Coach',       since: '2023-03-30' },
  'Anna':      { email: 'anna.carrot@velvix.org',           position: 'Coach',       since: '2023-11-24' },
  'Nikita':    { email: 'nikita.lanaya@velvix.org',         position: 'Analyst',     since: '2025-03-01' },
  'Curtis':    { email: 'kirill.curtis@velvix.org',         position: 'Supervisor',  since: '2024-03-25' },
  'Manuel':    { email: 'ruslan.manuel@velvix.org',         position: 'Supervisor',  since: '2024-04-08' },
  'Irma':      { email: 'janelle.irma@velvix.org',          position: 'Supervisor',  since: '2024-06-24' },
  'Solomon':   { email: 'ilia.solomon@velvix.org',          position: 'Supervisor',  since: '2023-06-30' },
  'Richard':   { email: 'ivan.richard@velvix.org',          position: 'Supervisor',  since: '2022-06-23' },
  'Toby':      { email: 'osman.toby@velvix.org',            position: 'Supervisor',  since: '2024-04-15' },
  'Will':      { email: 'rovshan.will@velvix.org',          position: 'Support',     since: '2025-07-29' },
  'Bridget':   { email: 'elvira.as@velvix.org',             position: 'Support',     since: '2025-12-08' },
  'Kenzo':     { email: 'nijat.kenzo@velvix.org',           position: 'Support',     since: '2025-07-22' },
  'Nora':      { email: 'alina.ja@velvix.org',              position: 'Support',     since: '2025-10-20' },
  'Florence':  { email: 'banovsha.florence@velvix.org',     position: 'Support',     since: '2024-01-29' },
  'Fletcher':  { email: 'sherzodjon.fletcher@velvix.org',   position: 'Support',     since: '2025-07-22' },
  'Charles':   { email: 'teymur.ab@velvix.org',             position: 'Support',     since: '2026-01-26' },
  'Earl':      { email: 'rashad.go@velvix.org',             position: 'Support',     since: '2026-01-12' },
  'Rudy':      { email: 'rufat.rudy@velvix.org',            position: 'Support',     since: '2024-06-10' },
  'Balfour':   { email: 'emin.nu@velvix.org',               position: 'Support',     since: '2025-10-20' },
  'Jonathan':  { email: 'dmitriy.be@velvix.org',            position: 'Support',     since: '2025-11-17' },
  'Bill':      { email: 'artsiom.pu@velvix.org',            position: 'Support',     since: '2026-01-12' },
  'Gross':     { email: 'ruslan.mi@velvix.org',             position: 'Support',     since: '2026-03-02' },
  'Meadow':    { email: 'assel.meadow@velvix.org',          position: 'Support',     since: '2024-08-08' },
  'Norman':    { email: 'elvin.norman@velvix.org',          position: 'Support',     since: '2024-01-29' },
  'Robin':     { email: 'mikita.ma@velvix.org',             position: 'Support',     since: '2025-12-08' },
  'Bob':       { email: 'maksym.k@velvix.org',              position: 'Support',     since: '2025-10-20' },
  'Lex':       { email: 'vladyslav.bi@velvix.org',          position: 'Support',     since: '2026-01-12' },
  'Calvin':    { email: 'radik.mu@velvix.org',              position: 'Support',     since: '2026-03-02' },
  'Mike':      { email: 'stanislav.mike@velvix.org',        position: 'Support',     since: '2023-08-28' },
  'Hardy':     { email: 'teymur.hardy@velvix.org',          position: 'Support',     since: '2025-07-29' },
  'Murphy':    { email: 'viktor.bo@velvix.org',             position: 'Support',     since: '2025-11-17' },
  'Joseph':    { email: 'oleh.vy@velvix.org',               position: 'Support',     since: '2025-10-20' },
  'Bowen':     { email: 'ivan.bowen@velvix.org',            position: 'Support',     since: '2024-05-27' },
  'Adam':      { email: 'vadym.adam@velvix.org',            position: 'VIP Sup',     since: '2023-08-17' },
  'Amelia':    { email: 'tamila.amelia@velvix.org',         position: 'VIP Sup',     since: '2023-10-23' },
  'Lucas':     { email: 'vladimir.lucas@velvix.org',        position: 'VIP Sup',     since: '2023-07-22' },
  'Scott':     { email: 'serghei.scott@velvix.org',         position: 'VIP',         since: '2023-04-25' },
  'Tom':       { email: 'fuad.tom@velvix.org',              position: 'VIP',         since: '2024-04-08' },
  'Simon':     { email: 'nurdaulet.simon@velvix.org',       position: 'VIP',         since: '2023-12-04' },
  'Casper':    { email: 'ruslan.casper@velvix.org',         position: 'VIP',         since: '2025-07-22' },
  'Elijah':    { email: 'alisher.elijah@velvix.org',        position: 'VIP',         since: '2024-05-27' },
  'Holly':     { email: 'lolita.holly@velvix.org',          position: 'VIP',         since: '2024-11-11' },
  'River':     { email: 'vladyslav.river@velvix.org',       position: 'VIP',         since: '2024-03-25' },
  'Chadwick':  { email: 'temirlan.chadwick@velvix.org',     position: 'VIP',         since: '2024-06-24' },
  'Fabio':     { email: 'daniil.fabio@velvix.org',          position: 'VIP',         since: '2024-11-25' },
  'Plover':    { email: 'timur.plover@velvix.org',          position: 'VIP',         since: '2024-09-16' },
  'Morgan':    { email: 'vladislav.morgan@velvix.org',      position: 'VIP',         since: '2024-05-13' },
  'Reggie':    { email: 'maksym.reggie@velvix.org',         position: 'VIP',         since: '2024-03-25' },
  'Nolan':     { email: 'aliyar.ko@velvix.org',             position: 'VIP',         since: '2025-10-20' },
  'Skylar':    { email: 'elnur.skylar@velvix.org',          position: 'VIP',         since: '2024-11-11' },
  'Wade':      { email: 'teymur.wade@velvix.org',           position: 'VIP',         since: '2024-03-25' },
  'Denzel':    { email: 'emil.denzel@velvix.org',           position: 'VIP',         since: '2024-02-26' },
  'Ashton':    { email: 'matsvei.ashton@velvix.org',        position: 'VIP',         since: '2024-11-25' },
  'Christine': { email: 'zuleykha.christine@velvix.org',    position: 'VIP',         since: '2024-06-24' },
  'Isaac':     { email: 'azim.isaac@velvix.org',            position: 'VIP',         since: '2024-01-15' },
  'Felicia':   { email: 'nigar.felicia@velvix.org',         position: 'VIP',         since: '2024-11-25' },
  'Warren':    { email: 'vladimir.warren@velvix.org',       position: 'VIP',         since: '2025-07-22' },
  'Alexia':    { email: 'sabina.ib@velvix.org',             position: 'VIP',         since: '2024-01-29' },
  'Kiana':     { email: 'kateryna.kiana@velvix.org',        position: 'VIP',         since: '2023-12-04' },
  'Trinity':   { email: 'muslmat.trinity@velvix.org',       position: 'VIP',         since: '2025-07-22' },
  'Оксана':    { email: 'oksana.qa@velvix.org',             position: 'QA Team Lead', since: '2023-03-20' },
  'Аня':       { email: 'anna.va@velvix.org',               position: 'QA Supervisor', since: '2023-04-04' },
  'Айгерим':   { email: 'aigerim.qa@velvix.org',            position: 'QA Manager',  since: '2023-04-17' },
  'Анастасия': { email: 'anastasia.qa@velvix.org',          position: 'QA Manager',  since: '2023-01-18' },
  'Натия':     { email: 'natia.qa@velvix.org',              position: 'QA Manager',  since: '2024-05-01' },
  'Сарвар':    { email: 'sarvar.qa@velvix.org',             position: 'QA Manager',  since: '2024-07-08' },
  'Зумруд':    { email: 'zumrud.qa@velvix.org',             position: 'QA Manager',  since: '2024-06-19' },
  'Roger':     { email: 'aliaksandr.roger@velvix.org',      position: 'QA AI',       since: '2023-08-28' },
};

// ── Секции (SECTIONS из v1) ───────────────────────────────────────────────────

export const SECTIONS_SEED = [
  {
    key: 'regular_support',
    label: 'Regular Support',
    color: 'blue',
    members: [
      'Curtis','Manuel','Richard','Irma','Solomon','Toby',
      'Will','Bridget','Fletcher','Kenzo','Nora','Robert',
      'Charles','Earl','Rudy','Bowen','Balfour','Jonathan',
      'Bill','Gross','Meadow','Robin','Bob','Lex','Calvin','Mike',
      'Florence','Hardy','Murphy','Joseph',
    ],
  },
  {
    key: 'vip_support',
    label: 'VIP Support',
    color: 'green',
    members: [
      'Adam','Amelia','Lucas',
      'Scott','Tom','Simon','Skylar','Felicia','Nolan',
      'Casper','Elijah','Holly','River','Chadwick','Fabio','Plover','Morgan','Reggie',
      'Wade','Ashton','Trinity','Christine','Isaac','Warren','Alexia','Kiana','Denzel',
    ],
  },
  {
    key: 'management',
    label: 'Management',
    color: 'blue',
    members: ['Oliver','Jordan','Naomi','Matthew','Reed','Jayden','Anna','Nikita'],
  },
  {
    key: 'qa',
    label: 'QA',
    color: 'orange',
    members: ['Оксана','Аня','Айгерим','Анастасия','Натия','Сарвар','Зумруд','Roger'],
  },
];

// ── Персональные часы (OPERATOR_HOURS_SEED из v1) ─────────────────────────────

export const OPERATOR_HOURS_SEED: Record<string, number> = {
  Adam: 8,
};

// ── Базовые паттерны (BASE_PATTERNS из v1) ────────────────────────────────────

function makeCycleFn(pattern: string[]) {
  return (date: Date) => {
    const diff = Math.round((date.getTime() - CYCLE_START.getTime()) / 86400000);
    const len = pattern.length;
    return pattern[((diff % len) + len) % len];
  };
}

function getSuperTeamShift(dayIndex: number, teamIndex: number, memberIndex: number): string {
  const cycle = 12;
  const pos = ((dayIndex % cycle) + cycle) % cycle;
  const team1WorkSlots = [0,1,4,5,8,9];
  const team2WorkSlots = [2,3,6,7,10,11];
  const workSlots = teamIndex === 0 ? team1WorkSlots : team2WorkSlots;
  if (!workSlots.includes(pos)) return 'off';
  const teamPos = workSlots.indexOf(pos);
  const period = Math.floor(teamPos / 2);
  const nightMember = [2, 1, 0][period];
  return memberIndex === nightMember ? 'super_night' : 'super_day';
}

const BASE_PATTERNS: Record<string, string[]> = {
  Will:      ['shift1200','off','off','shift1200'],
  Bridget:   ['shift1200','off','off','shift1200'],
  Fletcher:  ['shift1200','off','off','shift1200'],
  Kenzo:     ['off','shift1200','shift1200','off'],
  Nora:      ['off','shift1200','shift1200','off'],
  Robert:    ['off','shift1200','shift1200','off'],
  Florence:  ['morning','off','off','evening','evening','off','off','morning'],
  Charles:   ['off','evening','evening','off','off','morning','morning','off'],
  Earl:      ['off','evening','evening','off','off','morning','morning','off'],
  Rudy:      ['off','evening','evening','off','off','morning','morning','off'],
  Balfour:   ['off','morning','morning','off','off','evening','evening','off'],
  Jonathan:  ['off','morning','morning','off','off','evening','evening','off'],
  Bill:      ['off','morning','morning','off','off','evening','evening','off'],
  Gross:     ['off','morning','morning','off','off','evening','evening','off'],
  Meadow:    ['off','morning','morning','off','off','evening','evening','off'],
  Robin:     ['evening','off','off','morning','morning','off','off','evening'],
  Bob:       ['evening','off','off','morning','morning','off','off','evening'],
  Lex:       ['evening','off','off','morning','morning','off','off','evening'],
  Calvin:    ['morning','off','off','evening','evening','off','off','morning'],
  Mike:      ['evening','off','off','morning','morning','off','off','evening'],
  Hardy:     ['morning','off','off','evening','evening','off','off','morning'],
  Murphy:    ['morning','off','off','evening','evening','off','off','morning'],
  Joseph:    ['morning','off','off','evening','evening','off','off','morning'],
  Bowen:     ['off','evening','evening','off','off','morning','morning','off'],
  Scott:     ['off','off','vip_1200','vip_1200'],
  Tom:       ['off','vip_1200','vip_1200','off'],
  Simon:     ['off','vip_1200','vip_1200','off'],
  Skylar:    ['vip_1200','off','off','vip_1200'],
  Felicia:   ['vip_1200','off','off','vip_1200'],
  Nolan:     ['vip_1200','off','off','vip_1200'],
  Casper:    ['off','vip_morning','vip_morning','off','off','vip_evening','vip_evening','off'],
  Elijah:    ['off','vip_morning','vip_morning','off','off','vip_evening','vip_evening','off'],
  Holly:     ['off','vip_morning','vip_morning','off','off','vip_evening','vip_evening','off'],
  River:     ['off','vip_morning','vip_morning','off','off','vip_evening','vip_evening','off'],
  Chadwick:  ['off','vip_evening','vip_evening','off','off','vip_morning','vip_morning','off'],
  Fabio:     ['off','vip_evening','vip_evening','off','off','vip_morning','vip_morning','off'],
  Plover:    ['off','vip_evening','vip_evening','off','off','vip_morning','vip_morning','off'],
  Morgan:    ['off','vip_evening','vip_evening','off','off','vip_morning','vip_morning','off'],
  Reggie:    ['off','vip_evening','vip_evening','off','off','vip_morning','vip_morning','off'],
  Wade:      ['vip_morning','off','off','vip_evening','vip_evening','off','off','vip_morning'],
  Ashton:    ['vip_morning','off','off','vip_evening','vip_evening','off','off','vip_morning'],
  Trinity:   ['off','off','vip_evening','vip_evening','off','off','vip_morning','vip_morning'],
  Christine: ['vip_morning','off','off','vip_evening','vip_evening','off','off','vip_morning'],
  Isaac:     ['vip_morning','off','off','vip_evening','vip_evening','off','off','vip_morning'],
  Warren:    ['vip_evening','off','off','vip_morning','vip_morning','off','off','vip_evening'],
  Alexia:    ['vip_evening','off','off','vip_morning','vip_morning','off','off','vip_evening'],
  Kiana:     ['vip_evening','off','off','vip_morning','vip_morning','off','off','vip_evening'],
  Denzel:    ['vip_evening','off','off','vip_morning','vip_morning','off','off','vip_evening'],
};

export const OPERATOR_BASE_SHIFTS: Record<string, (date: Date) => string> = {};

// Простые паттерны
Object.entries(BASE_PATTERNS).forEach(([name, pattern]) => {
  OPERATOR_BASE_SHIFTS[name] = makeCycleFn(pattern);
});

// Менеджмент: 8ч в будни, выходной в выходные
['Oliver','Jordan','Naomi','Matthew','Reed','Jayden','Anna','Nikita'].forEach(name => {
  OPERATOR_BASE_SHIFTS[name] = (date: Date) => {
    const dow = date.getDay();
    return (dow === 0 || dow === 6) ? 'off' : 'work8';
  };
});

// Super-команды
const TEAM1 = ['Irma', 'Solomon', 'Toby'];
const TEAM2 = ['Curtis', 'Manuel', 'Richard'];
TEAM1.forEach((name, i) => {
  OPERATOR_BASE_SHIFTS[name] = (date: Date) => {
    const diff = Math.round((date.getTime() - CYCLE_START.getTime()) / 86400000);
    return getSuperTeamShift(diff, 0, i);
  };
});
TEAM2.forEach((name, i) => {
  OPERATOR_BASE_SHIFTS[name] = (date: Date) => {
    const diff = Math.round((date.getTime() - CYCLE_START.getTime()) / 86400000);
    return getSuperTeamShift(diff, 1, i);
  };
});

// QA — нет базового паттерна, показываем off
['Оксана','Аня','Айгерим','Анастасия','Натия','Сарвар','Зумруд','Roger'].forEach(name => {
  if (!OPERATOR_BASE_SHIFTS[name]) {
    OPERATOR_BASE_SHIFTS[name] = () => 'off';
  }
});
