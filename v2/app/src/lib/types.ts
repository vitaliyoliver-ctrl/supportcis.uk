// ── Типы смен ────────────────────────────────────────────────────────────────

export interface ShiftType {
  key: string;
  label: string;
  category: 'Regular' | 'VIP' | 'Sup' | 'Mgmt' | 'Other';
  hours: number;
  winStart: number | null;
  winEnd: number | null;
  isNight: boolean;
  isExtra: boolean;
  baseKey: string | null;
  givable: boolean;
  legacy: boolean;
}

// ── Сотрудники ────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  email: string;
  position: string;
  hiredAt: string | null;       // ISO date string
  dismissedAt: string | null;   // ISO date string, null = активен
  hours: number | null;         // персональные часы, null = из типа смены
  sectionId: string;
  sortOrder: number;
}

export interface Section {
  id: string;
  key: string;
  label: string;
  color: string;
  sortOrder: number;
  members: Employee[];          // заполняется на фронте после join
}

// ── Паттерны ─────────────────────────────────────────────────────────────────

export interface ShiftPattern {
  id: string;
  employeeId: string;
  cycleStart: string;           // ISO date string
  pattern: string[];            // ['morning','off','off','evening']
  priority: number;
}

// ── Overrides ─────────────────────────────────────────────────────────────────

export interface ExtraEvent {
  type: string;
  hours: number;
  range: string;
  swapWith: string;
  win: [number, number] | null;
  withLunch: boolean;
}

export interface ScheduleOverride {
  id: string;
  employeeId: string;
  date: string;                 // ISO date string
  shiftKey: string;
  extraEvents: ExtraEvent[];
  customHours: number | null;
  note: string | null;
  editedBy: string;
  editedAt: string;
}

// ── Свапы ─────────────────────────────────────────────────────────────────────

export type SwapStatus = 'pending' | 'approved' | 'denied';

export interface Swap {
  id: string;
  status: SwapStatus;
  giverId: string;
  recipientId: string;
  date: string;
  shiftKey: string;
  shiftLabel: string;
  range: string;
  hours: number;
  withLunch: boolean;
  win: [number, number] | null;
  comment: string;
  tgMessageId: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

// ── API-ответы ────────────────────────────────────────────────────────────────

export type Role = 'tl' | 'supervisor' | 'ops' | 'support';

export interface AuthCheck {
  ok: boolean;
  email?: string;
  role?: Role;
}

export interface ScheduleData {
  employees: Employee[];
  sections: Section[];
  overrides: ScheduleOverride[];
  patterns: ShiftPattern[];
  version: number;
  log: ScheduleLogEntry[];
}

export interface ScheduleLogEntry {
  id: string;
  at: string;
  by: string;
  action: string;
  targetName: string | null;
  month: string;
}
