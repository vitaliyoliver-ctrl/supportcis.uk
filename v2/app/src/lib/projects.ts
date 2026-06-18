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

export const PROJECTS: Record<ProjectKey, ProjectSeed> = {
  sg: {
    label: 'График',
    employees: EMPLOYEES_SEED,
    sections: SECTIONS_SEED,
    operatorBaseShifts: OPERATOR_BASE_SHIFTS,
    operatorHours: OPERATOR_HOURS_SEED,
    filters: SG_FILTERS,
    swapSectionKeys: ['regular_support', 'vip_support'],
  },
  nk: {
    label: 'График НК',
    employees: NK_EMPLOYEES_SEED,
    sections: NK_SECTIONS_SEED,
    operatorBaseShifts: NK_OPERATOR_BASE_SHIFTS,
    operatorHours: NK_OPERATOR_HOURS_SEED,
    filters: NK_FILTERS,
    swapSectionKeys: ['supervisors_nk', 'support_nk', 'temp_support'],
  },
};
