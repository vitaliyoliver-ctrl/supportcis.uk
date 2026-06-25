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

/** Список/поиск тикетов. Почты в ответе уже замаскированы псевдонимами. */
export function listTickets(opts: { query?: string; cursor?: string; status?: string } = {}): Promise<unknown> {
  const p = new URLSearchParams();
  if (opts.query) p.set('query', opts.query);
  if (opts.cursor) p.set('cursor', opts.cursor);
  if (opts.status) p.set('status', opts.status);
  return call(`/tickets${p.toString() ? '?' + p : ''}`);
}

/** Один тикет с перепиской (замаскировано). */
export function getTicket(id: string): Promise<unknown> {
  return call(`/tickets/${encodeURIComponent(id)}`);
}

/** Ответ оператора по ticket_id. Адрес получателя знать не нужно. */
export function replyTicket(id: string, text: string): Promise<unknown> {
  return call(`/tickets/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
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
