// Центральное состояние страницы графика.
// Воспроизводит глобальные переменные v1: scheduleOverrides, scheduleSettings,
// dismissedEmployees, SECTIONS, EMPLOYEES/scheduleSettings.employeeOverrides и т.д.

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSchedule, saveSchedule, type ScheduleSettings, type SaveSchedulePayload } from './scheduleApi';
import { getShift, getDaysInMonth, getAvailableMonths, getCurrentMonthClamped, type Override, type PatternEntry, type EmployeeData } from './scheduleLogic';
import { SHIFT_DEFS } from './shiftDefs';

// ── Хардкоженные данные (заменятся в v2.1 на API-запрос) ──────────────────────

import { EMPLOYEES_SEED, SECTIONS_SEED, OPERATOR_BASE_SHIFTS, OPERATOR_HOURS_SEED } from './seed';

// ── Типы ─────────────────────────────────────────────────────────────────────────

export type FilterKey = 'all' | 'regular' | 'vip' | 'supervisors' | 'management';

export interface SectionDef {
  key: string;
  label: string;
  color: string;
  members: string[];
}

// ── Хук ───────────────────────────────────────────────────────────────────────────

export function useScheduleState(currentUser: { email: string; role: string } | null) {
  const queryClient = useQueryClient();

  // Месяц
  const initialMonth = getCurrentMonthClamped();
  const [year, setYear] = useState(initialMonth.year);
  const [month, setMonth] = useState(initialMonth.month);
  const availableMonths = useMemo(() => getAvailableMonths(), []);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // Данные из API
  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ['schedule', monthStr],
    queryFn: () => fetchSchedule(monthStr),
    staleTime: 30_000,
  });

  const overrides: Record<string, Override> = scheduleData?.overrides ?? {};
  const settings: ScheduleSettings = scheduleData?.settings ?? {};
  const version: number = scheduleData?.version ?? 0;
  const log = scheduleData?.log ?? [];

  const operatorPatterns = settings.operatorPatterns ?? {};
  const employeeOverrides = settings.employeeOverrides ?? {};
  const dismissedEmployees = settings.dismissed ?? {};

  // Секции с динамическим порядком (из settings.people)
  const sections: SectionDef[] = useMemo(() => {
    const people = settings.people ?? {};
    const base = SECTIONS_SEED.map(s => ({
      ...s,
      members: [...s.members],
    }));

    // Применяем порядок и перемещения из settings.people
    const sorted = base.map(s => {
      const membersWithOrder = s.members.map(name => {
        const p = people[name];
        return { name, section: p?.section ?? s.key, order: p?.order ?? 9999 };
      });
      return {
        ...s,
        members: membersWithOrder
          .filter(x => x.section === s.key)
          .sort((a, b) => a.order - b.order)
          .map(x => x.name),
      };
    });

    // Добавляем людей перенесённых в секцию из другой
    Object.entries(people).forEach(([name, { section, order }]) => {
      if (!SECTIONS_SEED.find(s => s.members.includes(name))) {
        // Новый сотрудник, добавленный через addEmployee
        const sec = sorted.find(s => s.key === section);
        if (sec && !sec.members.includes(name)) {
          sec.members.push(name);
        }
      }
    });

    return sorted;
  }, [settings.people]);

  // getEmp — единый доступ к данным сотрудника
  const getEmp = useCallback((name: string): EmployeeData => {
    const ov = employeeOverrides[name] ?? {};
    const emp = EMPLOYEES_SEED[name] ?? {};
    return {
      name,
      email:    String(ov.email ?? emp.email ?? '').trim(),
      position: String(ov.position ?? emp.position ?? '').trim(),
      since:    ov.since ?? emp.since ?? '',
      hours:    ov.hours !== undefined ? Number(ov.hours) : OPERATOR_HOURS_SEED[name],
      dismissed: dismissedEmployees[name],
    };
  }, [employeeOverrides, dismissedEmployees]);

  // Дни месяца
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  // getShiftForCell — обёртка над getShift из scheduleLogic
  const getShiftForCell = useCallback((name: string, dayIndex: number) => {
    return getShift(
      name, dayIndex, days, year, month,
      overrides, dismissedEmployees, operatorPatterns, OPERATOR_BASE_SHIFTS
    );
  }, [days, year, month, overrides, dismissedEmployees, operatorPatterns]);

  // Mutation: сохранить изменения
  const saveMutation = useMutation({
    mutationFn: (payload: SaveSchedulePayload) => saveSchedule(monthStr, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(['schedule', monthStr], (old: typeof scheduleData) => ({
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
    queryClient.setQueryData(['schedule', monthStr], (old: typeof scheduleData) => ({
      ...old!,
      overrides: newOverrides,
      settings: newSettings ?? old!.settings,
    }));
  }, [saveMutation, settings, version, monthStr, queryClient]);

  // UI-состояние
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(() => {
    const today = new Date();
    if (today.getFullYear() === initialMonth.year && today.getMonth() + 1 === initialMonth.month) {
      return `${initialMonth.year}-${String(initialMonth.month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    return null;
  });

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
    const filterMap: Record<FilterKey, string[] | null> = {
      all: null,
      regular: ['regular_support'],
      vip: ['vip_support'],
      supervisors: ['regular_support', 'vip_support'],
      management: ['management'],
    };
    const allowed = filterMap[activeFilter];
    return allowed ? sections.filter(s => allowed.includes(s.key)) : sections;
  }, [sections, activeFilter]);

  const isAdmin = currentUser?.role === 'tl' || currentUser?.role === 'supervisor';

  return {
    // Месяц
    year, month, monthStr, availableMonths, switchMonth,
    // Данные
    days, overrides, settings, version, log, isLoading,
    operatorPatterns, dismissedEmployees,
    // Секции
    sections, filteredSections,
    // Helpers
    getEmp, getShiftForCell,
    employeeHoursSeed: OPERATOR_HOURS_SEED,
    operatorBaseShifts: OPERATOR_BASE_SHIFTS,
    // Сохранение
    saveOverrides, isSaving: saveMutation.isPending, saveError: saveMutation.error,
    // UI
    activeFilter, setActiveFilter,
    collapsedSections, toggleSection,
    selectedDateStr, setSelectedDateStr,
    isAdmin,
  };
}
