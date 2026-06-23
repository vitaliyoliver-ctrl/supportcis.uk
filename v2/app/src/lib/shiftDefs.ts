// Единый реестр типов смен — точная копия SHIFT_DEFS из v1.
// ВНИМАНИЕ: vip_morning = ночь, vip_evening = день (исторически перевёрнуто — не трогать).

export interface ShiftDef {
  hours: number;
  window: [number, number] | null;
  label: string;
  cat: 'Regular' | 'VIP' | 'Sup' | 'Mgmt' | 'Other';
  isNight?: boolean;
  isExtra?: boolean;
  base?: string;
  givable?: boolean;
  legacy?: boolean;
  busyAllDay?: boolean;
}

export const SHIFT_DEFS: Record<string, ShiftDef> = {
  // Regular
  morning:       { hours: 11, window: [9, 21],  label: 'День',          cat: 'Regular', givable: true },
  evening:       { hours: 11, window: [21, 33], label: 'Ночь',          cat: 'Regular', isNight: true, givable: true },
  shift1200:     { hours: 11, window: [12, 24], label: '12-00',         cat: 'Regular', givable: true },
  extra_morning: { hours: 0,  window: [9, 21],  label: '+Доп День',     cat: 'Regular', isExtra: true, base: 'morning' },
  extra_evening: { hours: 0,  window: [21, 33], label: '+Доп Ночь',     cat: 'Regular', isExtra: true, isNight: true, base: 'evening' },
  extra_1200:    { hours: 0,  window: [12, 24], label: '+Доп 12-00',    cat: 'Regular', isExtra: true, base: 'shift1200' },
  // VIP (перевёрнутые имена: vip_morning=ночь, vip_evening=день)
  vip_evening:       { hours: 11, window: [9, 21],  label: 'VIP День',       cat: 'VIP', givable: true },
  vip_morning:       { hours: 11, window: [21, 33], label: 'VIP Ночь',       cat: 'VIP', isNight: true, givable: true },
  vip_1200:          { hours: 11, window: [12, 24], label: 'VIP 12-00',      cat: 'VIP', givable: true },
  extra_vip_evening: { hours: 0,  window: [9, 21],  label: '+Доп VIP День',  cat: 'VIP', isExtra: true, base: 'vip_evening' },
  extra_vip_morning: { hours: 0,  window: [21, 33], label: '+Доп VIP Ночь',  cat: 'VIP', isExtra: true, isNight: true, base: 'vip_morning' },
  extra_vip_1200:    { hours: 0,  window: [12, 24], label: '+Доп VIP 12-00', cat: 'VIP', isExtra: true, base: 'vip_1200' },
  // Supervisors
  super_day:        { hours: 11, window: [9, 21],  label: 'Sup День',        cat: 'Sup', givable: true },
  super_night:      { hours: 11, window: [21, 33], label: 'Sup Ночь',        cat: 'Sup', isNight: true, givable: true },
  super_day8:       { hours: 8,  window: [10, 19], label: 'Sup 8ч',          cat: 'Sup', givable: true },
  extra_sup_day:    { hours: 0,  window: [9, 21],  label: '+Доп Sup День',   cat: 'Sup', isExtra: true, base: 'super_day' },
  extra_sup_night:  { hours: 0,  window: [21, 33], label: '+Доп Sup Ночь',   cat: 'Sup', isExtra: true, isNight: true, base: 'super_night' },
  extra_sup_day8:   { hours: 0,  window: [10, 19], label: '+Доп Sup 8ч',     cat: 'Sup', isExtra: true, base: 'super_day8' },
  // Прочее
  work8:     { hours: 8,  window: [9, 18], label: '8ч офис',       cat: 'Mgmt' },
  nk:        { hours: 11, window: null,   label: 'НК',             cat: 'Other', busyAllDay: true },
  night:     { hours: 11, window: [21, 33], label: 'Ночь (легаси)', cat: 'Other', isNight: true, legacy: true },
  vacation:  { hours: 0,  window: null,   label: 'Отпуск',         cat: 'Other' },
  sick:      { hours: 0,  window: null,   label: 'Больничный',     cat: 'Other' },
  birthday:  { hours: 0,  window: null,   label: 'Выходной ДР',   cat: 'Other' },
  off:       { hours: 0,  window: null,   label: 'Выходной',       cat: 'Other' },
  dismissed: { hours: 0,  window: null,   label: 'Уволен',         cat: 'Other' },
};

export const DEFAULT_HOURS = Object.fromEntries(
  Object.entries(SHIFT_DEFS).map(([t, d]) => [t, d.hours])
);

// Для селектора типов смен в редакторе
export interface ShiftTypeOption {
  type: string;
  label: string;
  time: string;
  group: 'Regular' | 'VIP' | 'Sup' | 'Mgmt' | null;
}

export const SHIFT_TYPES_ALL: ShiftTypeOption[] = [
  { type: 'morning',         label: 'День',          time: '09–21', group: 'Regular' },
  { type: 'evening',         label: 'Ночь',          time: '21–09', group: 'Regular' },
  { type: 'shift1200',       label: '12-12',         time: '12–00', group: 'Regular' },
  { type: 'extra_morning',   label: '+ Доп День',    time: '09–21', group: 'Regular' },
  { type: 'extra_evening',   label: '+ Доп Ночь',    time: '21–09', group: 'Regular' },
  { type: 'extra_1200',      label: '+ Доп 12-12',   time: '12–00', group: 'Regular' },
  { type: 'vip_evening',         label: 'День',           time: '09–21', group: 'VIP' },
  { type: 'vip_morning',         label: 'Ночь',           time: '21–09', group: 'VIP' },
  { type: 'vip_1200',            label: '12-12',          time: '12–00', group: 'VIP' },
  { type: 'extra_vip_evening',   label: '+ Доп День',     time: '09–21', group: 'VIP' },
  { type: 'extra_vip_morning',   label: '+ Доп Ночь',     time: '21–09', group: 'VIP' },
  { type: 'extra_vip_1200',      label: '+ Доп 12-12',    time: '12–00', group: 'VIP' },
  { type: 'super_day',       label: 'День 11ч',      time: '09–21', group: 'Sup' },
  { type: 'super_night',     label: 'Ночь 11ч',      time: '21–09', group: 'Sup' },
  { type: 'super_day8',      label: 'День 8ч',       time: '09–18', group: 'Sup' },
  { type: 'extra_sup_day',   label: '+ Доп 11ч',     time: '09–21', group: 'Sup' },
  { type: 'extra_sup_night', label: '+ Доп Ночь',    time: '21–09', group: 'Sup' },
  { type: 'extra_sup_day8',  label: '+ Доп 8ч',      time: '09–18', group: 'Sup' },
  { type: 'work8',           label: '8h офис',        time: '09–18', group: 'Mgmt' },
  { type: 'nk',              label: 'НК',             time: 'НК',    group: null },
  { type: 'vacation',        label: 'Отпуск',         time: '✈',    group: null },
  { type: 'sick',            label: 'Больничный',     time: '🤒',   group: null },
  { type: 'birthday',        label: 'Выходной ДР',   time: '🎂',   group: null },
  { type: 'off',             label: 'Выходной',       time: '—',    group: null },
];

// Доп события
export const EXTRA_PLUS_TYPES = [
  { value: 'extra_critical',       label: 'Крит ситуация' },
  { value: 'extra_vacation_cover', label: 'Замена отпуска' },
  { value: 'extra_sick_cover',     label: 'Замена больничного' },
  { value: 'extra_swap_take',      label: 'Получение/Обмен' },
  { value: 'extra_org_plus',       label: 'Орг моменты' },
  { value: 'extra_sick_paid',      label: 'Оплачиваемый больничный' },
];

export const EXTRA_MINUS_TYPES = [
  { value: 'loss_sick',      label: 'Больничный' },
  { value: 'loss_vacation',  label: 'Отпуск' },
  { value: 'loss_org',       label: 'Орг моменты' },
  { value: 'loss_swap_give', label: 'Отдача/Обмен' },
  { value: 'loss_dismissal', label: 'Увольнение' },
];

export const PLUS_EVENT_TYPES = new Set([
  'extra_critical', 'extra_vacation_cover', 'extra_sick_cover',
  'extra_swap_take', 'extra_org_plus', 'extra_sick_paid',
]);

export const ALL_EXTRA_LABELS: Record<string, string> = {
  extra_critical:       'Крит ситуация',
  extra_vacation_cover: 'Замена отпуска',
  extra_sick_cover:     'Замена больничного',
  extra_swap_take:      'Получение/Обмен',
  extra_org_plus:       'Орг моменты (+)',
  extra_sick_paid:      'Оплачиваемый больничный',
  loss_sick:            'Больничный (-)',
  loss_vacation:        'Отпуск (-)',
  loss_org:             'Орг моменты (-)',
  loss_swap_give:       'Отдача/Обмен (-)',
  loss_dismissal:       'Увольнение (-)',
};

// Минимальный штат
export const MIN_STAFF = { day: 4, night: 3, d12: 2 };

// Паттерн-пресеты (для редактора паттернов).
// ВАЖНО: каждый пресет начинается с НАЧАЛА рабочего блока (день 0 = первый рабочий
// день, а не середина блока). Паттерн применяется так, что pattern[0] приходится на
// выбранную дату начала цикла (cycleStart), поэтому «зеркальная» запись вида
// ['morning','off','off',...,'morning'] дала бы на старте всего 1 рабочий день
// (2 день/2 вых разрывается на границе массива). Выровнено по блоку → старт цикла с
// любой даты даёт чистый «2 рабочих / 2 вых / 2 рабочих / 2 вых».
export const PATTERN_PRESETS: Record<string, string[]> = {
  morning_evening: ['morning','morning','off','off','evening','evening','off','off'],
  evening_morning: ['evening','evening','off','off','morning','morning','off','off'],
  shift1200:       ['shift1200','shift1200','off','off'],
  vip_day_night:   ['vip_evening','vip_evening','off','off','vip_morning','vip_morning','off','off'],
  vip_night_day:   ['vip_morning','vip_morning','off','off','vip_evening','vip_evening','off','off'],
  vip_1200:        ['vip_1200','vip_1200','off','off'],
  super_2_2:       ['super_day','super_day','off','off'],
  super_night_2_2: ['super_night','super_night','off','off'],
  super_2_2_mix:   ['super_day','super_day','off','off','super_night','super_night','off','off'],
  super_12_cycle:  ['super_day','super_day','off','off','super_day','super_day','off','off','super_night','super_night','off','off'],
  work8_5_2:       ['work8','work8','work8','work8','work8','off','off'],
  off:             ['off'],
};

export const PATTERN_PRESET_LABELS: Record<string, string> = {
  morning_evening: '09-21 / 21-09 (день первый)',
  evening_morning: '21-09 / 09-21 (ночь первой)',
  shift1200:       '12-00 / выходной 2/2',
  vip_day_night:   'VIP день/ночь (день первый)',
  vip_night_day:   'VIP ночь/день (ночь первой)',
  vip_1200:        'VIP 12-00 / выходной 2/2',
  super_2_2:       'Sup День 2/2',
  super_night_2_2: 'Sup Ночь 2/2',
  super_2_2_mix:   'Sup День+Ночь 4+4+4',
  super_12_cycle:  'Sup 12-дн. цикл',
  work8_5_2:       '8ч пн–пт (TL/QA)',
  off:             'Выходной (нет смен)',
  custom:          'Кастомный',
};

// SWAP конфиги
export const SWAP_MIN_REST = 6;
export const SWAP_BLOCK_DAY = new Set(['vacation', 'sick', 'nk', 'birthday', 'dismissed']);
