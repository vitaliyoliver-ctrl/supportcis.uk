// API-клиент для тикет-системы HelpDesk с маскировкой почт.
// Все запросы идут в наш Worker (/api/helpdesk/*), который ходит в HelpDesk
// серверным токеном и вычищает адреса до отдачи фронту. Прямого доступа к
// api.helpdesk.com у браузера оператора нет.

const API = '/api/helpdesk';

export interface HelpdeskResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: 'include', ...init });
  const data = await res.json().catch(() => ({})) as HelpdeskResult<T> & { error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.data as T;
}

// ── Формы данных HelpDesk (то, что реально приходит, с уже замаскированными почтами) ──
export interface TicketEvent {
  ID: number;
  type: 'message' | 'status' | 'tags' | 'assignment' | 'customFields' | 'followers' | 'teamVisibility' | string;
  date: string;
  author?: { type?: string; ID?: string; name?: string; email?: string };
  message?: { isPrivate?: boolean; text?: string; richTextHtml?: string | null };
  status?: { new?: string; old?: string };
}
export interface Ticket {
  ID: string;
  shortID?: string;
  subject?: string;
  status?: string;
  createdAt?: string;
  lastMessageAt?: string;
  requester?: { email?: string; name?: string };
  assignment?: { team?: { name?: string } | null; agent?: { name?: string } | null };
  events?: TicketEvent[];
  customFields?: Record<string, string>;
  [k: string]: unknown;
}

export interface TicketFilters {
  query?: string; status?: string; teamIDs?: string[];
  createdFrom?: string; createdTo?: string; activeFrom?: string; activeTo?: string;
}

/** Список/поиск тикетов с серверной фильтрацией. Почты уже замаскированы. */
export async function listTickets(opts: TicketFilters = {}): Promise<Ticket[]> {
  const p = new URLSearchParams();
  p.set('pageSize', '100');
  if (opts.query) p.set('query', opts.query);
  if (opts.status) p.set('status', opts.status);
  for (const id of opts.teamIDs || []) p.append('teamIDs[]', id);
  // Даты приводим к границам суток в ISO.
  if (opts.createdFrom) p.set('createdDateFrom', opts.createdFrom + 'T00:00:00Z');
  if (opts.createdTo) p.set('createdDateTo', opts.createdTo + 'T23:59:59Z');
  if (opts.activeFrom) p.set('lastMessageFrom', opts.activeFrom + 'T00:00:00Z');
  if (opts.activeTo) p.set('lastMessageTo', opts.activeTo + 'T23:59:59Z');
  const data = await call<unknown>(`/tickets${p.toString() ? '?' + p : ''}`);
  if (Array.isArray(data)) return data as Ticket[];
  const d = (data || {}) as Record<string, unknown>;
  for (const k of ['tickets', 'records', 'items', 'data', 'results']) {
    if (Array.isArray(d[k])) return d[k] as Ticket[];
  }
  return [];
}

export interface Team { ID: string; name: string; }
/** Все команды (группы) — для фильтра. */
export async function listTeams(): Promise<Team[]> {
  const res = await fetch(`${API}/teams`, { credentials: 'include' });
  const data = await res.json().catch(() => ({})) as { ok: boolean; teams?: Team[]; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.teams || [];
}

// Персональные сохранённые наборы фильтров.
export interface SavedFilter {
  name: string; statuses: string[]; teamIDs: string[];
  createdFrom?: string; createdTo?: string; activeFrom?: string; activeTo?: string;
}
export async function getSavedFilters(): Promise<SavedFilter[]> {
  const res = await fetch(`${API}/saved-filters`, { credentials: 'include' });
  const data = await res.json().catch(() => ({})) as { ok: boolean; filters?: SavedFilter[] };
  if (!res.ok || !data.ok) return [];
  return data.filters || [];
}
export async function saveSavedFilters(filters: SavedFilter[]): Promise<void> {
  const res = await fetch(`${API}/saved-filters`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters),
  });
  const data = await res.json().catch(() => ({})) as { ok: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
}

/** Создание нового тикета. */
export function createTicket(payload: Record<string, unknown>): Promise<unknown> {
  return call('/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Один тикет с перепиской (замаскировано). */
export function getTicket(id: string): Promise<unknown> {
  return call(`/tickets/${encodeURIComponent(id)}`);
}

/** Ответ оператора по ticket_id. isPrivate=true — приватная заметка для команды. */
export function replyTicket(id: string, text: string, isPrivate = false): Promise<unknown> {
  return call(`/tickets/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, isPrivate }),
  });
}

export interface AuditEntry { at: string; by: string; action: string; detail: string; }

/** Журнал действий (только TL). */
export async function getAudit(): Promise<AuditEntry[]> {
  const res = await fetch(`${API}/audit`, { credentials: 'include' });
  const data = await res.json().catch(() => ({})) as { ok: boolean; log?: AuditEntry[]; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.log || [];
}
