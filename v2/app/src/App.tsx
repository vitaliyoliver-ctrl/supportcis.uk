import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';

// ── Auth ───────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const res = await fetch('/api/check', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json() as Promise<{ ok: boolean; email: string; role: string }>;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!data?.ok) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!data?.ok) return <Navigate to="/login" replace />;
  if (!roles.includes(data.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0c10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: '#4f8ef7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}

// ── Lazy pages ─────────────────────────────────────────────────────────────────

const HomePage        = React.lazy(() => import('./pages/HomePage'));
const SupportPage     = React.lazy(() => import('./pages/SupportPage'));
const TicketsPage     = React.lazy(() => import('./pages/TicketsPage'));

const SchedulePage    = React.lazy(() => import('./pages/schedule/SchedulePage'));
const BreaksPage      = React.lazy(() => import('./pages/BreaksPage'));
const SalesPage       = React.lazy(() => import('./pages/SalesPage'));
const ReportPage      = React.lazy(() => import('./pages/ReportPage'));
const ReportNcPage    = React.lazy(() => import('./pages/ReportNcPage'));
const ChampionsPage   = React.lazy(() => import('./pages/ChampionsPage'));

const TLPage          = React.lazy(() => import('./pages/tl/TLPage'));
const TLMainPage      = React.lazy(() => import('./pages/tl/TLMainPage'));
const TLDataPage      = React.lazy(() => import('./pages/tl/TLDataPage'));
const TLDailyReport   = React.lazy(() => import('./pages/tl/TLDailyReport'));
const TLFcrPage       = React.lazy(() => import('./pages/tl/TLFcrPage'));
const TLRolesPage     = React.lazy(() => import('./pages/tl/TLRolesPage'));
const TLCsatPage      = React.lazy(() => import('./pages/tl/TLCsatPage'));

const OpsPage         = React.lazy(() => import('./pages/ops/OpsPage'));
const OpsStructure    = React.lazy(() => import('./pages/ops/OpsStructure'));
const OpsPayment      = React.lazy(() => import('./pages/ops/OpsPayment'));

// ── Router ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />

        <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />

        {/* Support */}
        <Route path="/support"          element={<RequireAuth><SupportPage /></RequireAuth>} />
        <Route path="/support/tickets"  element={<RequireAuth><TicketsPage /></RequireAuth>} />
        <Route path="/support/schedule"    element={<RequireAuth><SchedulePage project="sg" /></RequireAuth>} />
        <Route path="/support/schedule-nc" element={<RequireAuth><SchedulePage project="nk" /></RequireAuth>} />
        <Route path="/support/breaks"   element={<RequireAuth><BreaksPage /></RequireAuth>} />
        <Route path="/support/sales"    element={<RequireAuth><SalesPage /></RequireAuth>} />
        <Route path="/support/report"   element={<RequireAuth><ReportPage /></RequireAuth>} />
        <Route path="/support/report-nc" element={<RequireAuth><ReportNcPage /></RequireAuth>} />
        <Route path="/support/champions" element={<RequireAuth><ChampionsPage /></RequireAuth>} />

        {/* TL */}
        <Route path="/tl"              element={<RequireRole roles={['tl','ops']}><TLPage /></RequireRole>} />
        <Route path="/tl/main"         element={<RequireRole roles={['tl','ops']}><TLMainPage /></RequireRole>} />
        <Route path="/tl/data"         element={<RequireRole roles={['tl','ops']}><TLDataPage /></RequireRole>} />
        <Route path="/tl/daily-report" element={<RequireRole roles={['tl','ops']}><TLDailyReport /></RequireRole>} />
        <Route path="/tl/fcr"          element={<RequireRole roles={['tl','ops']}><TLFcrPage /></RequireRole>} />
        <Route path="/tl/csat"         element={<RequireRole roles={['tl','ops']}><TLCsatPage /></RequireRole>} />
        <Route path="/tl/roles"        element={<RequireRole roles={['tl','ops']}><TLRolesPage /></RequireRole>} />

        {/* Ops */}
        <Route path="/ops"             element={<RequireRole roles={['ops','tl']}><OpsPage /></RequireRole>} />
        <Route path="/ops/structure"   element={<RequireRole roles={['ops','tl']}><OpsStructure /></RequireRole>} />
        <Route path="/ops/payment"     element={<RequireRole roles={['ops','tl']}><OpsPayment /></RequireRole>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
