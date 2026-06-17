// Dev-only мок /api — позволяет смотреть защищённые страницы без воркера.
// Активируется через VITE_MOCK_API=1 (npm run dev:mock). На прод не влияет.
import type { Plugin, Connect } from 'vite';

const MOCK_USER = { ok: true, email: 'vitaliy.oliver@velvix.org', role: 'tl' };

function json(res: Parameters<Connect.NextHandleFunction>[1], body: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: Parameters<Connect.NextHandleFunction>[0]): Promise<unknown> {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

// Простейшее in-memory хранилище графика на время dev-сессии
const scheduleStore: Record<string, { overrides: Record<string, unknown>; settings: Record<string, unknown>; version: number; log: unknown[] }> = {};

// Демо-данные рейтинга продаж
const MOCK_SALES = {
  ok: true,
  period: 'Июнь 2026',
  updatedAt: new Date().toISOString(),
  rows: [
    { name: 'Scott',  deposits: 142, amount: 38400, bonus: 1920 },
    { name: 'Tom',    deposits: 128, amount: 35100, bonus: 1755 },
    { name: 'Simon',  deposits: 119, amount: 31200, bonus: 1560 },
    { name: 'Casper', deposits: 104, amount: 27800, bonus: 1390 },
    { name: 'Elijah', deposits: 97,  amount: 24900, bonus: 1245 },
    { name: 'Holly',  deposits: 81,  amount: 20100, bonus: 1005 },
    { name: 'River',  deposits: 76,  amount: 18700, bonus: 935  },
    { name: 'Fabio',  deposits: 64,  amount: 15400, bonus: 770  },
  ],
};

export function mockApiPlugin(): Plugin {
  return {
    name: 'dev-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/')) return next();
        const path = url.split('?')[0];
        const method = (req.method || 'GET').toUpperCase();

        // ── Auth ──
        if (path === '/api/check') return json(res, MOCK_USER);
        if (path === '/api/logout') return json(res, { ok: true });
        if (path === '/api/send-code') return json(res, { ok: true });
        if (path === '/api/verify-code') return json(res, { ok: true });

        // ── Schedule ──
        if (path === '/api/schedule' && method === 'GET') {
          const month = new URLSearchParams(url.split('?')[1] || '').get('month') || 'cur';
          const store = scheduleStore[month] ?? { overrides: {}, settings: {}, version: 1, log: [] };
          return json(res, { ok: true, ...store });
        }
        if (path === '/api/schedule' && method === 'POST') {
          const month = new URLSearchParams(url.split('?')[1] || '').get('month') || 'cur';
          const body = (await readBody(req)) as { overrides?: Record<string, unknown>; settings?: Record<string, unknown>; version?: number; logEntries?: Array<Record<string, unknown>> };
          const prev = scheduleStore[month] ?? { overrides: {}, settings: {}, version: 1, log: [] };
          const newVersion = prev.version + 1;
          const newLog = [
            ...(body.logEntries ?? []).map(e => ({ at: new Date().toISOString(), by: MOCK_USER.email, ...e })),
            ...prev.log,
          ].slice(0, 50);
          scheduleStore[month] = {
            overrides: body.overrides ?? prev.overrides,
            settings: body.settings ?? prev.settings,
            version: newVersion,
            log: newLog,
          };
          return json(res, { ok: true, version: newVersion, log: newLog });
        }
        if (path === '/api/swap-request') return json(res, { ok: true, id: 'mock-' + Date.now() });

        // ── Profile ──
        if (path === '/api/profile' && method === 'GET') {
          return json(res, { ok: true, profile: { telegram: 'oliver_work' } });
        }
        if (path === '/api/profile' && method === 'POST') {
          const body = (await readBody(req)) as Record<string, unknown>;
          return json(res, { ok: true, profile: body });
        }
        if (path === '/api/profiles') {
          return json(res, { ok: true, profiles: {} });
        }
        if (path === '/api/roles') {
          if (method === 'GET') return json(res, { ok: true, roles: {} });
          return json(res, { ok: true });
        }

        // ── Sales ──
        if (path === '/api/sales/data') return json(res, MOCK_SALES);
        if (path === '/api/sales/upload') return json(res, { ok: true });

        // Fallback
        return json(res, { ok: false, error: 'mock: not implemented', path }, 404);
      });
    },
  };
}
