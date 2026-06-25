import { Link, useNavigate } from 'react-router-dom';

// Port of v1 support/index.html — лендинг раздела Support.

const S = {
  bg: { position: 'relative' as const, minHeight: '100vh', background: '#0a0c10', color: '#e8eaf0', fontFamily: "'Mulish', sans-serif", overflowX: 'hidden' as const },
  grid: { position: 'fixed' as const, inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' as const, zIndex: 0 },
  glow: { position: 'fixed' as const, width: 600, height: 600, borderRadius: '50%', filter: 'blur(120px)', opacity: 0.12, background: '#34d399', bottom: -200, right: -100, pointerEvents: 'none' as const, zIndex: 0 },
  wrapper: { position: 'relative' as const, zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '40px 24px' },
  topBtn: (left: boolean) => ({ position: 'fixed' as const, top: 24, [left ? 'left' : 'right']: 24, display: 'flex', alignItems: 'center', gap: 6, background: left ? 'none' : 'rgba(255,255,255,0.04)', border: left ? 'none' : '1px solid rgba(255,255,255,0.07)', borderRadius: 10, color: '#6b7280', fontSize: left ? 13 : 12, fontFamily: "'Mulish', sans-serif", padding: '7px 14px', cursor: 'pointer', textDecoration: 'none', zIndex: 10 }),
};

const ACCENT = '#34d399';
const GLOW = 'rgba(52,211,153,0.18)';

const cards = [
  { to: '/support/tickets',     icon: '🎫', title: 'Тикеты', desc: 'Поиск по тикетам и ответы клиентам — почты клиентов замаскированы' },
  { to: '/support/schedule',    icon: '📅', title: 'График смен SG', desc: 'Расписание смен команды SupportCIS — Regular, VIP и Management' },
  { to: '/support/schedule-nc', icon: '🛰️', title: 'График смен НК', desc: 'Расписание смен НК-команды — Supervisors и Support NC' },
  { to: '/support/champions', icon: '🏆', title: 'Support Champions', desc: 'Турнирная таблица операторов — рейтинг по КСАТ, времени ответа и чемпионскому баллу' },
  { to: '/support/sales',     icon: '💰', title: 'Рейтинг продаж', desc: 'Статистика продаж бонусов по операторам — конверсии, офферы и бонусные выплаты' },
  { to: '/support/breaks',    icon: '☕', title: 'Перерывы и обеды', desc: 'Бронирование перерывов и обедов для операторов — дневная и ночная смены' },
  { to: '/support/report',    icon: '🎯', title: 'Фиксация трудностей', desc: 'Форма для фиксации технических трудностей клиентов — отправка в Teams и Excel' },
  { to: '/support/report-nc', icon: '🛰️', title: 'Фиксация трудностей НК', desc: 'Форма для фиксации трудностей НК-команды — MOTOR и Атом, отправка в Teams и Excel' },
];

export default function SupportPage() {
  const navigate = useNavigate();

  async function logout() {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
    navigate('/login');
  }

  return (
    <div style={S.bg}>
      <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;700&family=Mulish:wght@300;400;600&display=swap" rel="stylesheet" />
      <div style={S.grid} />
      <div style={S.glow} />

      <Link to="/" style={S.topBtn(true)}>← Назад на главную</Link>
      <button onClick={logout} style={S.topBtn(false)}>↩ Выйти</button>

      <div style={S.wrapper}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: GLOW, color: ACCENT, border: `1px solid ${GLOW}`, borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />Support Access
          </div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 10 }}>For Support</h1>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Ресурсы и инструменты для команды поддержки</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 900, width: '100%' }}>
          {cards.map(c => (
            <Link key={c.to} to={c.to} style={{ position: 'relative', background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '32px 28px', textDecoration: 'none', color: 'inherit', overflow: 'hidden', display: 'block', transition: 'transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = ACCENT; el.style.transform = 'translateY(-5px)'; el.style.boxShadow = `0 8px 40px ${GLOW}, 0 0 0 1px ${ACCENT}`; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.07)'; el.style.transform = ''; el.style.boxShadow = ''; }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 12, background: GLOW, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>{c.icon}</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>{c.desc}</div>
              <div style={{ position: 'absolute', bottom: 24, right: 24, color: '#6b7280', fontSize: 16 }}>→</div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 56, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>© 2026 Velvix · Внутреннее использование</div>
      </div>
    </div>
  );
}
