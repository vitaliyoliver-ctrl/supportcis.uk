// Центральное состояние страницы графика.
// Воспроизводит глобальные переменные v1: scheduleOverrides, scheduleSettings,
// dismissedEmployees, SECTIONS, EMPLOYEES/scheduleSettings.employeeOverrides и т.д.

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSchedule, saveSchedule, type ScheduleSettings, type SaveSchedulePayload } from './scheduleApi';
import { getShift, getDaysInMonth, getAvailableMonths, getCurrentMonthClamped, type Override, type PatternEntry, type EmployeeData } from './scheduleLogic';
import { SHIFT_DEFS } from './shiftDefs';

// ── Сид-данные проектов (заменятся в v2.1 на API-запрос) ──────────────────────

import { PROJECTS, type ProjectKey } from './projects';

// ── Типы ─────────────────────────────────────────────────────────────────────────

// Фильтры теперь задаются проектом (projects.ts), поэтому ключ — произвольная строка.
export type FilterKey = string;

export interface SectionDef {
  key: string;
  label: string;
  color: string;
  members: string[];
}

// ── Хук ───────────────────────────────────────────────────────────────────────────

export function useScheduleState(
  currentUser: { email: string; role: string } | null,
  project: ProjectKey = 'sg',
) {
  const queryClient = useQueryClient();
  const seed = PROJECTS[project];

  // Месяц
  const initialMonth = getCurrentMonthClamped();
  const [year, setYear] = useState(initialMonth.year);
  const [month, setMonth] = useState(initialMonth.month);
  const availableMonths = useMemo(() => getAvailableMonths(), []);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // Данные из API
  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ['schedule', project, monthStr],
    queryFn: () => fetchSchedule(monthStr, project),
    staleTime: 30_000,
  });

  const overrides: Record<string, Override> = scheduleData?.overrides ?? {};
  const settings: ScheduleSettings = scheduleData?.settings ?? {};
  const version: number = scheduleData?.version ?? 0;
  const log = scheduleData?.log ?? [];

  const operatorPatterns = settings.operatorPatterns ?? {};
  const employeeOverrides = settings.employeeOverrides ?? {};
  const dismissedEmployees = settings.dismissed ?? {};

  // Секции и порядок строк — из settings.customOrder (канонический формат v1:
  // массив имён на каждую секцию, задаёт и состав, и порядок).
  const sections: SectionDef[] = useMemo(() => {
    const customOrder = settings.customOrder ?? {};
    return seed.sections.map(s => {
      const order = customOrder[s.key];
      return {
        ...s,
        members: Array.isArray(order) && order.length ? [...order] : [...s.members],
      };
    });
  }, [settings.customOrder, seed.sections]);

  // getEmp — единый доступ к данным сотрудника
  const getEmp = useCallback((name: string): EmployeeData => {
    const ov = employeeOverrides[name] ?? {};
    const emp = seed.employees[name] ?? {};
    return {
      name,
      email:    String(ov.email ?? emp.email ?? '').trim(),
      position: String(ov.position ?? emp.position ?? '').trim(),
      since:    ov.since ?? emp.since ?? '',
      hours:    ov.hours !== undefined ? Number(ov.hours) : seed.operatorHours[name],
      dismissed: dismissedEmployees[name],
    };
  }, [employeeOverrides, dismissedEmployees, seed]);

  // Дни месяца
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  // getShiftForCell — обёртка над getShift из scheduleLogic
  const getShiftForCell = useCallback((name: string, dayIndex: number) => {
    return getShift(
      name, dayIndex, days, year, month,
      overrides, dismissedEmployees, operatorPatterns, seed.operatorBaseShifts
    );
  }, [days, year, month, overrides, dismissedEmployees, operatorPatterns, seed]);

  // Mutation: сохранить изменения
  const saveMutation = useMutation({
    mutationFn: (payload: SaveSchedulePayload) => saveSchedule(monthStr, payload, project),
    onSuccess: (result) => {
      queryClient.setQueryData(['schedule', project, monthStr], (old: typeof scheduleData) => ({
        ...old!,
        version: result.version,
        log: result.log,
      }));
    },
  });

  const saveOverrides = useCallback(async (
    newOverrides: Record<string, Override>,
    newSettings?: ScheduleSettings,
    logEntries?: Array<{ action: string; target?: string | null }>
  ) => {
    await saveMutation.mutateAsync({
      overrides: newOverrides,
      settings: newSettings ?? settings,
      version,
      logEntries,
    });
    // Обновляем локальный кэш optimistically
    queryClient.setQueryData(['schedule', project, monthStr], (old: typeof scheduleData) => ({
      ...old!,
      overrides: newOverrides,
      settings: newSettings ?? old!.settings,
    }));
  }, [saveMutation, settings, version, monthStr, project, queryClient]);

  // UI-состояние
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  // Панель дня закрыта на старте — всплывает только по клику на дату (как в v1).
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Смена месяца
  const switchMonth = useCallback((y: number, m: number) => {
    setYear(y);
    setMonth(m);
    setSelectedDateStr(null);
  }, []);

  // Фильтрованные секции
  const filteredSections = useMemo(() => {
    const def = seed.filters.find(f => f.key === activeFilter);
    const allowed = def?.sectionKeys ?? null;
    return allowed ? sections.filter(s => allowed.includes(s.key)) : sections;
  }, [sections, activeFilter, seed.filters]);

  const isAdmin = currentUser?.role === 'tl' || currentUser?.role === 'supervisor';

  return {
    // Месяц
    year, month, monthStr, availableMonths, switchMonth,
    // Данные
    days, overrides, settings, version, log, isLoading,
    operatorPatterns, dismissedEmployees,
    // Секции
    sections, filteredSections,
    // Проект
    filters: seed.filters, projectLabel: seed.label, project, swapSectionKeys: seed.swapSectionKeys,
    // Helpers
    getEmp, getShiftForCell,
    employeeHoursSeed: seed.operatorHours,
    operatorBaseShifts: seed.operatorBaseShifts,
    // Сохранение
    saveOverrides, isSaving: saveMutation.isPending, saveError: saveMutation.error,
    // UI
    activeFilter, setActiveFilter,
    collapsedSections, toggleSection,
    selectedDateStr, setSelectedDateStr,
    isAdmin,
  };
}
