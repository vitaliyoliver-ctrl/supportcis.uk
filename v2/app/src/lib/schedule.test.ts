import { describe, it, expect } from 'vitest';
import { resolveShift, buildOverrideMap, daysBetween } from './schedule';
import type { Employee, ShiftPattern, ScheduleOverride } from './types';

const emp: Employee = {
  id: 'e1',
  name: 'TestOp',
  email: 'test@velvix.org',
  position: 'Support',
  hiredAt: '2024-01-01',
  dismissedAt: null,
  hours: null,
  sectionId: 's1',
  sortOrder: 0,
};

describe('daysBetween', () => {
  it('same day = 0', () => expect(daysBetween('2026-06-01', '2026-06-01')).toBe(0));
  it('1 day', () => expect(daysBetween('2026-06-01', '2026-06-02')).toBe(1));
  it('across month', () => expect(daysBetween('2026-06-28', '2026-07-01')).toBe(3));
});

describe('resolveShift', () => {
  const pattern: ShiftPattern = {
    id: 'p1',
    employeeId: 'e1',
    cycleStart: '2026-06-01',
    pattern: ['morning', 'off', 'off', 'morning'],
    priority: 0,
  };

  it('returns pattern shift on day 0', () => {
    expect(resolveShift(emp, '2026-06-01', new Map(), [pattern])).toBe('morning');
  });

  it('returns pattern shift on day 2 (off)', () => {
    expect(resolveShift(emp, '2026-06-03', new Map(), [pattern])).toBe('off');
  });

  it('pattern wraps around', () => {
    // day 4 = pos 0 = morning
    expect(resolveShift(emp, '2026-06-05', new Map(), [pattern])).toBe('morning');
  });

  it('override beats pattern', () => {
    const ov: ScheduleOverride = {
      id: 'o1', employeeId: 'e1', date: '2026-06-01',
      shiftKey: 'sick', extraEvents: [], customHours: null,
      note: null, editedBy: 'tl@x.org', editedAt: '2026-06-01T10:00:00Z',
    };
    const map = buildOverrideMap([ov]);
    expect(resolveShift(emp, '2026-06-01', map, [pattern])).toBe('sick');
  });

  it('returns dismissed after dismissedAt', () => {
    const dismissed = { ...emp, dismissedAt: '2026-06-15' };
    expect(resolveShift(dismissed, '2026-06-16', new Map(), [pattern])).toBe('dismissed');
    expect(resolveShift(dismissed, '2026-06-15', new Map(), [pattern])).not.toBe('dismissed');
  });

  it('returns off when no pattern', () => {
    expect(resolveShift(emp, '2026-06-01', new Map(), [])).toBe('off');
  });

  it('later pattern wins over earlier', () => {
    const p2: ShiftPattern = {
      id: 'p2', employeeId: 'e1',
      cycleStart: '2026-06-03',
      pattern: ['evening'],
      priority: 0,
    };
    // day 2026-06-03: p2 active, cycle day 0 = evening
    expect(resolveShift(emp, '2026-06-03', new Map(), [pattern, p2])).toBe('evening');
    // day 2026-06-01: only p1 active
    expect(resolveShift(emp, '2026-06-01', new Map(), [pattern, p2])).toBe('morning');
  });
});
