// API-запросы для страницы графика

const API = '/api';

export interface ScheduleApiData {
  overrides: Record<string, import('./scheduleLogic').Override>;
  settings: ScheduleSettings;
  version: number;
  log: LogEntry[];
}

export interface ScheduleSettings {
  operatorPatterns?: Record<string, import('./scheduleLogic').PatternEntry | import('./scheduleLogic').PatternEntry[]>;
  employeeOverrides?: Record<string, {
    email?: string;
    position?: string;
    since?: string;
    hours?: number;
  }>;
  people?: Record<string, { section: string; order: number }>;
  positions?: Record<string, number>;
  dismissed?: Record<string, string>;
}

export interface LogEntry {
  at: string;
  by: string;
  action: string;
  target?: string | null;
}

export async function fetchSchedule(month: string, project = 'sg'): Promise<ScheduleApiData> {
  const res = await fetch(`${API}/schedule?month=${month}&project=${project}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { ok: boolean } & ScheduleApiData;
  if (!data.ok) throw new Error('API error');
  return data;
}

export interface SaveSchedulePayload {
  overrides: Record<string, import('./scheduleLogic').Override>;
  settings?: ScheduleSettings;
  version: number;
  logEntries?: Array<{ action: string; target?: string | null }>;
}

export async function saveSchedule(
  month: string,
  payload: SaveSchedulePayload,
  project = 'sg'
): Promise<{ version: number; log: LogEntry[] }> {
  const res = await fetch(`${API}/schedule?month=${month}&project=${project}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) throw Object.assign(new Error('stale'), { stale: true });
  const data = await res.json() as { ok: boolean; version: number; log: LogEntry[]; error?: string };
  if (!data.ok) throw new Error(data.error || 'Ошибка сохранения');
  return { version: data.version, log: data.log };
}

export async function submitSwapRequest(body: {
  project: string; month: string; date: string;
  giver: string; recipient: string; recipientEmail: string;
  shiftType: string; shiftLabel: string; range: string;
  hours: number; win: [number, number]; withLunch: boolean; comment: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${API}/swap-request`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { ok: boolean; id?: string; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка отправки');
  return { id: data.id! };
}
