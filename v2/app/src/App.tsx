import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

// ── Auth guard ─────────────────────────────────────────────────────────────────

function useAuth() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const res = await fetch('/api/auth/check', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json() as Promise<{ ok: boolean; email: string; role: string }>;
    },
  });
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <div style={{ color: '#fff', padding: 32 }}>Загрузка...</div>;
  if (!data?.ok) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ── Pages (placeholder, будут заменяться по мере разработки) ──────────────────

function LoginPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0c10' }}>
      <div style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>
        Support<span style={{ color: '#4f8ef7' }}>CIS</span>
        <p style={{ color: '#9ca3af', fontSize: 14, fontWeight: 400, marginTop: 8 }}>
          Страница входа — в разработке
        </p>
      </div>
    </div>
  );
}

function SchedulePage() {
  return (
    <div style={{ color: '#fff', padding: 32 }}>
      <h1>График — в разработке</h1>
    </div>
  );
}

function IndexPage() {
  const { data } = useAuth();
  const role = data?.role;
  if (role === 'tl' || role === 'ops') return <Navigate to="/tl" replace />;
  return <Navigate to="/support/schedule" replace />;
}

// ── Router ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><IndexPage /></RequireAuth>} />
      <Route path="/support/schedule" element={<RequireAuth><SchedulePage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
