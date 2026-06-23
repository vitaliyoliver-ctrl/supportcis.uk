import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const cards = [
  { to: '/ops/structure', icon: '⚙️', title: 'Operations Structure', desc: 'Организационная структура, процессы и регламенты операционного отдела' },
  { to: '/ops/payment',   icon: '📊', title: 'Payment Report',       desc: 'Сравнительная статистика тикетов по payment-командам и брендам с почасовой разбивкой' },
];

export default function OpsPage() {
  const navigate = useNavigate();

  async function logout() {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
    navigate('/login');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c10', color: '#e8eaf0', fontFamily: "'Mulish', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;700&family=Mulish:wght@300;400;600&display=swap" rel="stylesheet" />
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', width: 500, height: 500, borderRadius: '50%', filter: 'blur(120px)', opacity: 0.1, background: '#f59e42', top: -100, left: -100, pointerEvents: 'none', zIndex: 0 }} />

      <button onClick={() => navigate('/')} style={{ position: 'fixed', top: 24, left: 24, background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontFamily: "'Mulish', sans-serif", zIndex: 10 }}>← Назад на главную</button>
      <button onClick={logout} style={{ position: 'fixed', top: 24, right: 24, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, color: '#6b7280', fontSize: 12, padding: '7px 14px', cursor: 'pointer', fontFamily: "'Mulish', sans-serif", zIndex: 10 }}>↩ Выйти</button>

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 56 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,66,0.18)', color: '#f59e42', border: '1px solid rgba(245,158,66,0.2)', borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
          Ops Access
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 10 }}>For Operations</h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Структура и процессы операционного отдела</p>
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr', gap: 20, maxWidth: 380, width: '100%' }}>
        {cards.map(c => (
          <Link key={c.to} to={c.to} style={{ position: 'relative', background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '32px 28px', textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(245,158,66,0.18)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>{c.icon}</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>{c.desc}</div>
            <div style={{ position: 'absolute', bottom: 24, right: 24, color: '#6b7280', fontSize: 16 }}>→</div>
          </Link>
        ))}
      </div>

      <div style={{ position: 'relative', zIndex: 1, marginTop: 56, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>© 2026 Velvix · Внутреннее использование</div>
    </div>
  );
}
