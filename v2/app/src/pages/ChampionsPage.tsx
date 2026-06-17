import React, { useEffect, useState } from 'react';
// Port of support/champions/index.html (Hall of Fame leaderboard)
// Full implementation pending — data fetched from /api/sales/champions
export default function ChampionsPage() {
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(false); }, []);
  if (loading) return <div style={{ minHeight: '100vh', background: '#0B0E17', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#8A8FA8' }}>Загрузка...</div></div>;
  return (
    <div style={{ minHeight: '100vh', background: '#0B0E17', color: '#F0EDE6', fontFamily: "'Nunito', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
        <h1 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 32, fontWeight: 700, marginBottom: 8, color: '#FFD700' }}>Зал Славы</h1>
        <p style={{ color: '#8A8FA8' }}>Раздел в разработке</p>
      </div>
    </div>
  );
}
