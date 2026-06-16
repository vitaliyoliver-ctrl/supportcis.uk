// Excel экспорт — точный перенос из v1 exportToExcel()
// Используется SheetJS (xlsx) — тот же пакет что и в v1

import type { Override } from '@/lib/scheduleLogic';
import { calcDayHours, dateStr, getShift, getPatternEntries, getPatternShift } from '@/lib/scheduleLogic';
import { SHIFT_DEFS, ALL_EXTRA_LABELS, PLUS_EVENT_TYPES } from '@/lib/shiftDefs';
import type { SectionDef } from '@/lib/useScheduleState';

interface ExportParams {
  year: number;
  month: number;
  days: Array<{d: number; date: Date}>;
  sections: SectionDef[];
  overrides: Record<string, Override>;
  getShiftForCell: (name: string, di: number) => string;
  getEmp: (name: string) => { email: string; position: string; since: string; hours?: number };
  employeeHoursSeed: Record<string, number>;
}

const SHIFT_LABELS = Object.fromEntries(
  Object.entries(SHIFT_DEFS).map(([t, d]) => [t, d.label])
);
SHIFT_LABELS.off = '—';

export async function exportToExcel(params: ExportParams) {
  const XLSX = await import('xlsx');
  const { year, month, days, sections, overrides, getShiftForCell, getEmp, employeeHoursSeed } = params;

  const wb = XLSX.utils.book_new();

  const allMembers = sections.flatMap(s => s.members.map(name => ({
    name, section: s.label, position: getEmp(name).position,
  })));

  const mo = String(month).padStart(2, '0');

  // ── Лист 1: График ───────────────────────────────────────────────────────────
  const scheduleHeader = ['Сотрудник', 'Отдел', 'Позиция', ...days.map(d => `${d.d}/${month}`)];
  const scheduleRows = [scheduleHeader, ...allMembers.map(({ name, section, position }) => [
    name, section, position,
    ...days.map((_, di) => SHIFT_LABELS[getShiftForCell(name, di)] || getShiftForCell(name, di)),
  ])];

  const ws1 = XLSX.utils.aoa_to_sheet(scheduleRows);
  ws1['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 16 }, ...days.map(() => ({ wch: 7 }))];
  XLSX.utils.book_append_sheet(wb, ws1, 'График');

  // ── Лист 2: Статистика часов ──────────────────────────────────────────────────
  const statsHeader = [
    'Сотрудник', 'Отдел', 'Позиция',
    'Всего часов', 'Смен',
    'День', 'Ночь', '12-00', 'VIP День', 'VIP Ночь', 'VIP 12-00',
    'Sup День', 'Sup Ночь', 'Sup 8ч', '8ч офис', 'НК',
    'Отпусков', 'Больничных', 'Выходных',
  ];

  const statsRows = [statsHeader, ...allMembers.map(({ name, section, position }) => {
    const counts: Record<string, number> = {};
    let totalHours = 0, totalShifts = 0;

    days.forEach((d, di) => {
      const type = getShiftForCell(name, di);
      const statType = (SHIFT_DEFS[type] as { base?: string })?.base ?? type;
      counts[statType] = (counts[statType] || 0) + 1;

      const key = `${name}:${dateStr(year, month, d.d)}`;
      totalHours += calcDayHours(type, overrides[key], name, employeeHoursSeed);
      if (!['off','vacation','sick','birthday','dismissed'].includes(type)) totalShifts++;
    });

    return [
      name, section, position, totalHours, totalShifts,
      counts.morning || 0, (counts.evening || 0) + (counts.night || 0), counts.shift1200 || 0,
      counts.vip_evening || 0, counts.vip_morning || 0, counts.vip_1200 || 0,
      counts.super_day || 0, counts.super_night || 0, counts.super_day8 || 0,
      counts.work8 || 0, counts.nk || 0,
      counts.vacation || 0, counts.sick || 0, counts.off || 0,
    ];
  })];

  const ws2 = XLSX.utils.aoa_to_sheet(statsRows);
  ws2['!cols'] = [{ wch: 16 },{ wch: 20 },{ wch: 16 },{ wch: 12 },{ wch: 8 },
    ...Array(14).fill({ wch: 7 })];
  XLSX.utils.book_append_sheet(wb, ws2, 'Статистика');

  // ── Лист 3: Доп события ───────────────────────────────────────────────────────
  const extraHeader = ['Сотрудник', 'Отдел', 'Позиция', 'Дата', 'Тип события', 'Часы', 'Заметка'];
  const extraRows: unknown[][] = [extraHeader];

  allMembers.forEach(({ name, section, position }) => {
    days.forEach(d => {
      const key = `${name}:${dateStr(year, month, d.d)}`;
      const ov = overrides[key];
      if (ov?.extraEvents?.length) {
        ov.extraEvents.forEach(ev => {
          if (ev.hours > 0) {
            extraRows.push([
              name, section, position,
              `${d.d}.${month}.${year}`,
              ALL_EXTRA_LABELS[ev.type] || ev.type,
              ev.hours,
              ov.note || '',
            ]);
          }
        });
      }
    });
  });

  const ws3 = XLSX.utils.aoa_to_sheet(extraRows);
  ws3['!cols'] = [{ wch: 16 },{ wch: 20 },{ wch: 16 },{ wch: 12 },{ wch: 22 },{ wch: 7 },{ wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Доп события');

  // ── Лист 4: Сводка доп часов ──────────────────────────────────────────────────
  const summaryHeader = [
    'Сотрудник', 'Отдел', 'Позиция',
    'Замена отпуска', 'Замена больничного', 'Крит ситуация',
    'Увольнение', 'Орг моменты', 'Обмен (отдал)', 'Обмен (получил)', 'Итого доп часов',
  ];
  const summaryRows: unknown[][] = [summaryHeader];

  allMembers.forEach(({ name, section, position }) => {
    const extraTotals: Record<string, number> = {};
    days.forEach(d => {
      const key = `${name}:${dateStr(year, month, d.d)}`;
      const ov = overrides[key];
      ov?.extraEvents?.forEach(ev => {
        if (ev.hours > 0) extraTotals[ev.type] = (extraTotals[ev.type] || 0) + ev.hours;
      });
    });

    if (Object.keys(extraTotals).length) {
      const total = Object.entries(extraTotals).reduce(
        (a, [type, h]) => a + (PLUS_EVENT_TYPES.has(type) ? h : -h), 0
      );
      summaryRows.push([
        name, section, position,
        extraTotals.extra_vacation_cover || 0,
        extraTotals.extra_sick_cover || 0,
        extraTotals.extra_critical || 0,
        extraTotals.loss_dismissal || 0,
        (extraTotals.extra_org_plus || 0) - (extraTotals.loss_org || 0),
        extraTotals.loss_swap_give || 0,
        extraTotals.extra_swap_take || 0,
        total,
      ]);
    }
  });

  const ws4 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws4['!cols'] = [{ wch: 16 },{ wch: 20 },{ wch: 16 },
    { wch: 16 },{ wch: 18 },{ wch: 14 },
    { wch: 12 },{ wch: 14 },{ wch: 16 },{ wch: 18 },{ wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Сводка доп часов');

  const monthName = new Date(year, month - 1, 1).toLocaleDateString('ru', { month: 'long' });
  XLSX.writeFile(wb, `График_${monthName}_${year}.xlsx`);
}
