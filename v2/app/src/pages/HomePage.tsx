import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';

// Port of v1 root index.html — лендинг портала с тремя разделами.

const S = {
  bg: { position: 'relative' as const, minHeight: '100vh', background: '#0a0c10', color: '#e8eaf0', fontFamily: "'Mulish', sans-serif", overflowX: 'hidden' as const },
  grid: { position: 'fixed' as const, inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' as const, zIndex: 0 },
  glow1: { position: 'fixed' as const, width: 600, height: 600, borderRadius: '50%', filter: 'blur(120px)', opacity: 0.12, background: '#4f8ef7', top: -200, left: -100, pointerEvents: 'none' as const, zIndex: 0 },
  glow2: { position: 'fixed' as const, width: 600, height: 600, borderRadius: '50%', filter: 'blur(120px)', opacity: 0.12, background: '#34d399', bottom: -200, right: -100, pointerEvents: 'none' as const, zIndex: 0 },
  wrapper: { position: 'relative' as const, zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '40px 24px' },
  topBtn: (left: boolean) => ({ position: 'fixed' as const, top: 24, [left ? 'left' : 'right']: 24, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, color: '#6b7280', fontSize: 12, fontFamily: "'Mulish', sans-serif", padding: '7px 14px', cursor: 'pointer', textDecoration: 'none', zIndex: 10 }),
};

const cards = [
  { to: '/tl', accent: '#4f8ef7', glow: 'rgba(79,142,247,0.18)', icon: '⚡', badge: 'TL Access', title: 'For TL Support', desc: 'Инструменты и аналитика для тимлидов. Доступно только для TL.' },
  { to: '/support', accent: '#34d399', glow: 'rgba(52,211,153,0.18)', icon: '💬', badge: 'Support Access', title: 'For Support', desc: 'Ресурсы и инструменты для команды поддержки. Доступно всем сотрудникам по рабочей почте @velvix.org.' },
  { to: '/ops', accent: '#f59e42', glow: 'rgba(245,158,66,0.18)', icon: '⚙️', badge: 'Ops Access', title: 'For Operations', desc: 'Структура и процессы операционного отдела. Доступ по приглашению.' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { data } = useAuth();

  async function logout() {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
    navigate('/login');
  }

  return (
    <div style={S.bg}>
      <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;700&family=Mulish:wght@300;400;600&display=swap" rel="stylesheet" />
      <div style={S.grid} />
      <div style={S.glow1} />
      <div style={S.glow2} />

      {data?.ok && <Link to="/profile" style={S.topBtn(true)}>👤 Личный кабинет</Link>}
      <button onClick={logout} style={S.topBtn(false)}>↩ Выйти</button>

      <div style={S.wrapper}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#4f8ef7,#34d399)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: '#fff' }}>Support<span style={{ color: '#4f8ef7' }}>CIS</span></div>
          </div>
          <p style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 11, fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'transparent', background: 'linear-gradient(90deg,#4f8ef7,#34d399,#f59e42)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>Внутренний портал команды</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 900, width: '100%' }}>
          {cards.map(c => (
            <Link key={c.to} to={c.to} style={{ position: 'relative', background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '36px 28px', textDecoration: 'none', color: 'inherit', overflow: 'hidden', display: 'block', transition: 'transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = c.accent; el.style.transform = 'translateY(-6px)'; el.style.boxShadow = `0 8px 40px ${c.glow}, 0 0 0 1px ${c.accent}`; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.07)'; el.style.transform = ''; el.style.boxShadow = ''; }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20, background: c.glow, border: '1px solid rgba(255,255,255,0.06)' }}>{c.icon}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20, marginBottom: 16, background: c.glow, color: c.accent }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{c.badge}
              </div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 10, lineHeight: 1.3 }}>{c.title}</div>
              <div style={{ fontSize: 13, color: '#9ca3b0', lineHeight: 1.7 }}>{c.desc}</div>
              <div style={{ position: 'absolute', bottom: 28, right: 28, width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14 }}>→</div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 56, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>© 2026 Velvix · Внутреннее использование</div>
      </div>
    </div>
  );
}
