import React from 'react';
import { useNavigate } from 'react-router-dom';
export default function OpsPayment() {
  const nav = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#0a0c10', color: '#e8eaf0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Mulish', sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>OpsPayment</h1>
        <p style={{ color: '#6b7280', marginBottom: 24 }}>Раздел в разработке</p>
        <button onClick={() => nav(-1)} style={{ background: 'rgba(245,158,66,0.18)', border: '1px solid rgba(245,158,66,0.3)', color: '#f59e42', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontFamily: "'Mulish', sans-serif" }}>← Назад</button>
      </div>
    </div>
  );
}
