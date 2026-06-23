// Реестр проектов графика. Каждый проект самодостаточен: состав, секции,
// базовые смены, часы и фильтры. Добавить новый проект = добавить сюда запись,
// без правок логики страницы.

import { EMPLOYEES_SEED, SECTIONS_SEED, OPERATOR_BASE_SHIFTS, OPERATOR_HOURS_SEED } from './seed';
import {
  NK_EMPLOYEES_SEED,
  NK_SECTIONS_SEED,
  NK_OPERATOR_BASE_SHIFTS,
  NK_OPERATOR_HOURS_SEED,
} from './seedNk';
import { MIN_STAFF } from './shiftDefs';

export type ProjectKey = 'sg' | 'nk';

export interface EmployeeSeed {
  email: string;
  position: string;
  since: string;
}

export interface SectionSeed {
  key: string;
  label: string;
  color: string;
  members: string[];
}

// Фильтр над секциями. sectionKeys=null — показать все.
export interface FilterDef {
  key: string;
  label: string;
  sectionKeys: string[] | null;
}

// Строка счётчика «на смене» в шапке секции графика.
export interface CountRow { types: string[]; label: string; color: string; min: number; }
// Конфиг счётчиков секции: строки + типы день/ночь и пороги для подсветки нехватки.
export interface CountConfig {
  rows: CountRow[];
  dayTypes: string[];
  nightTypes: string[];
  dayMin: number;
  nightMin: number;
}
// Карточка StatsBar (середина): сколько людей в указанных секциях.
export interface StatCard { label: string; sectionKeys: string[]; operatorsOnly: boolean; }

export interface ProjectSeed {
  /** Заголовок в шапке графика. */
  label: string;
  employees: Record<string, EmployeeSeed>;
  sections: SectionSeed[];
  operatorBaseShifts: Record<string, (date: Date) => string>;
  operatorHours: Record<string, number>;
  filters: FilterDef[];
  /** Секции, чьи участники могут отдавать/получать смены (для модалки обмена). */
  swapSectionKeys: string[];
  /** Конфиг счётчиков «на смене» по секциям (ключ секции → конфиг). */
  countSections: Record<string, CountConfig>;
  /** Секции, исключаемые из подсчёта часов и «всего персонала» (временные). */
  tempSectionKeys: string[];
  /** Средние карточки StatsBar. */
  statCards: StatCard[];
  /** Исключать ли супервайзеров из «операторов онлайн». */
  onlineOperatorsOnly: boolean;
}

const SG_FILTERS: FilterDef[] = [
  { key: 'all',         label: 'Все',         sectionKeys: null },
  { key: 'regular',     label: 'Regular',     sectionKeys: ['regular_support'] },
  { key: 'vip',         label: 'VIP',         sectionKeys: ['vip_support'] },
  { key: 'supervisors', label: 'Supervisors', sectionKeys: ['regular_support', 'vip_support'] },
  { key: 'management',  label: 'Management',  sectionKeys: ['management'] },
];

const NK_FILTERS: FilterDef[] = [
  { key: 'all',         label: 'Все',         sectionKeys: null },
  { key: 'supervisors', label: 'Supervisors', sectionKeys: ['supervisors_nk'] },
  { key: 'support',     label: 'Support',     sectionKeys: ['support_nk'] },
];

// Счётчики «на смене» по секциям. SG — regular и vip (3 строки), NK — support (день/ночь).
const SG_COUNT: Record<string, CountConfig> = {
  regular_support: {
    rows: [
      { types: ['morning', 'extra_morning'], label: '09–21', color: '#60a5fa', min: MIN_STAFF.day },
      { types: ['evening', 'extra_evening'], label: '21–09', color: '#818cf8', min: MIN_STAFF.night },
      { types: ['shift1200', 'extra_1200'],  label: '12–00', color: '#f59e0b', min: MIN_STAFF.d12 },
    ],
    dayTypes: ['morning', 'extra_morning'], nightTypes: ['evening', 'extra_evening'],
    dayMin: MIN_STAFF.day, nightMin: MIN_STAFF.night,
  },
  vip_support: {
    rows: [
      { types: ['vip_evening', 'extra_vip_evening'], label: '09–21', color: '#2dd4bf', min: MIN_STAFF.day },
      { types: ['vip_morning', 'extra_vip_morning'], label: '21–09', color: '#e879f9', min: MIN_STAFF.night },
      { types: ['vip_1200', 'extra_vip_1200'],       label: '12–00', color: '#a3e635', min: MIN_STAFF.d12 },
    ],
    dayTypes: ['vip_evening', 'extra_vip_evening'], nightTypes: ['vip_morning', 'extra_vip_morning'],
    dayMin: MIN_STAFF.day, nightMin: MIN_STAFF.night,
  },
};
const NK_COUNT: Record<string, CountConfig> = {
  support_nk: {
    rows: [
      { types: ['morning', 'extra_morning'], label: '09–21', color: '#60a5fa', min: 2 },
      { types: ['evening', 'extra_evening'], label: '21–09', color: '#818cf8', min: 1 },
    ],
    dayTypes: ['morning', 'extra_morning'], nightTypes: ['evening', 'extra_evening'],
    dayMin: 2, nightMin: 1,
  },
};

export const PROJECTS: Record<ProjectKey, ProjectSeed> = {
  sg: {
    label: 'График',
    employees: EMPLOYEES_SEED,
    sections: SECTIONS_SEED,
    operatorBaseShifts: OPERATOR_BASE_SHIFTS,
    operatorHours: OPERATOR_HOURS_SEED,
    filters: SG_FILTERS,
    swapSectionKeys: ['regular_support', 'vip_support'],
    countSections: SG_COUNT,
    tempSectionKeys: [],
    statCards: [
      { label: 'Regular Support', sectionKeys: ['regular_support'], operatorsOnly: true },
      { label: 'VIP Support', sectionKeys: ['vip_support'], operatorsOnly: true },
    ],
    onlineOperatorsOnly: true,
  },
  nk: {
    label: 'График НК',
    employees: NK_EMPLOYEES_SEED,
    sections: NK_SECTIONS_SEED,
    operatorBaseShifts: NK_OPERATOR_BASE_SHIFTS,
    operatorHours: NK_OPERATOR_HOURS_SEED,
    filters: NK_FILTERS,
    swapSectionKeys: ['supervisors_nk', 'support_nk', 'temp_support'],
    countSections: NK_COUNT,
    tempSectionKeys: ['temp_support'],
    statCards: [
      { label: 'Supervisors', sectionKeys: ['supervisors_nk'], operatorsOnly: false },
      { label: 'Support NC', sectionKeys: ['support_nk'], operatorsOnly: false },
    ],
    onlineOperatorsOnly: false,
  },
};
