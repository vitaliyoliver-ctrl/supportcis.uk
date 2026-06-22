import { describe, it, expect } from 'vitest';
import { getPatternShift, parseLocalDate, type PatternEntry } from './scheduleLogic';
import { PATTERN_PRESETS } from './shiftDefs';

// Применяем пресет с произвольной даты начала цикла и читаем смены подряд.
function run(pattern: string[], cycleStart: string, fromDs: string, days: number): string[] {
  const operatorPatterns: Record<string, PatternEntry[]> = {
    Op: [{ pattern, cycleStart, v: 2 }],
  };
  const out: string[] = [];
  const start = parseLocalDate(fromDs);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push(getPatternShift('Op', d, operatorPatterns) ?? 'null');
  }
  return out;
}

describe('PATTERN_PRESETS — фаза цикла', () => {
  // Все рабочие пресеты должны начинаться с НАЧАЛА рабочего блока, иначе при
  // старте цикла с произвольной даты первый блок схлопнется в 1 день.
  it('каждый пресет начинается с полного рабочего блока (день 0 = день 1 блока)', () => {
    Object.entries(PATTERN_PRESETS)
      .filter(([key]) => key !== 'off')
      .forEach(([key, pattern]) => {
        expect(pattern[0], `${key}: первый день не должен быть выходным`).not.toBe('off');
        expect(pattern[1], `${key}: первый рабочий блок должен быть >= 2 дней`).toBe(pattern[0]);
      });
  });

  it('стандартный 2/2/2/2 с произвольной даты даёт чистый первый блок', () => {
    // Баг: старт с 2 июля давал «1 рабочий, 2 вых, 2 рабочих, 2 вых».
    const shifts = run(PATTERN_PRESETS.morning_evening, '2026-07-02', '2026-07-02', 10);
    expect(shifts).toEqual([
      'morning', 'morning',   // 2 дня
      'off', 'off',           // 2 вых
      'evening', 'evening',   // 2 ночи
      'off', 'off',           // 2 вых
      'morning', 'morning',   // цикл повторяется чисто
    ]);
  });

  it('пресет 12-00 (длина 4) тоже стартует с 2 рабочих', () => {
    const shifts = run(PATTERN_PRESETS.shift1200, '2026-07-02', '2026-07-02', 6);
    expect(shifts).toEqual(['shift1200', 'shift1200', 'off', 'off', 'shift1200', 'shift1200']);
  });
});
