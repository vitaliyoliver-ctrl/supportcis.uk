import React, { useState, useEffect } from 'react';

const POWER_AUTOMATE_URL = "https://defaulte2f944de9f4f4231833c439e8d8d9b.8f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/172eb6b253a4422d9edae0049c158c0c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=VgxAD1BEU7Q7_vl9qjEgJTQJKE4k7G7-4TEecuccfYo";

const PROVIDERS = ['Все провайдеры','3 Oaks Gaming','4ThePlayer','Amatic','Amusnet','AvatarUX','Aviatrix','Bang Bang','Belatra','BetSoft','BGaming','Big Time Gaming','Boomerang','Devxpress','ELK Studios','Endorphina','Evolution','Evoplay','Ezugi','Fugaso','Galaxsys','GameArt','Gamzix','HacksawGaming','Hot Rise','ICONIC21','Igrosoft','ISoftBet','Mascot Gaming','Microgaming','NetEnt','NetGame','Nolimit City','Novomatic','Onlyplay','PeterAndSons','PG Soft','Platipus',"Play'n GO",'Playson','PopiPlay','Pragmatic Play','Pragmatic Play Live','Print Studios','Push Gaming','Quickspin','Red Tiger','RedRakeGaming','Reel Play','Reflex Gaming','Relax Gaming','RubyPlay','Skillzz','SmartSoft','Spinomenal','SpinOn','Spribe','Thunderkick','TomHornGaming','TurboGames','Upgaming','Wazdan','Yggdrasil'];
const PROJECTS = ['CAT','GAMA','DADDY','MERS','KENT','R7','KOMETA','ARKADA'];
const DIFFICULTIES = ['Не работает сайт','Не работают слоты','Не грузятся картинки','Не может сделать депозит','Не может сделать вывод','Не работает чат','Проблемы с бонусами','Другое'];

function kyivTime() {
  const kyiv = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    time: `${pad(kyiv.getHours())}:${pad(kyiv.getMinutes())}:${pad(kyiv.getSeconds())}`,
    date: `${pad(kyiv.getDate())}.${pad(kyiv.getMonth()+1)}.${kyiv.getFullYear()}`,
  };
}

const inputStyle: React.CSSProperties = { width: '100%', background: '#13161e', border: '1px solid #252a38', borderRadius: 8, color: '#e8eaf0', fontFamily: "'Manrope', sans-serif", fontSize: 14, padding: '10px 14px', outline: 'none' };
const selStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', appearance: 'none' as const };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#8b92a5', letterSpacing: '0.2px', display: 'block', marginBottom: 6 };

export default function ReportPage() {
  const [liveTime, setLiveTime] = useState('--:--:--');
  const [sending, setSending] = useState(false);
  const [sendCount, setSendCount] = useState(0);
  const [toast, setToast] = useState<{ type: 'success'|'error'|'loading'; text: string } | null>(null);
  const [sendToTeams, setSendToTeams] = useState(false);
  const [webhook, setWebhook] = useState('');

  const [accountId, setAccountId]     = useState('');
  const [project, setProject]         = useState('');
  const [difficulty, setDifficulty]   = useState('');
  const [chatLink, setChatLink]       = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [screenshot, setScreenshot]   = useState('');
  const [diffDesc, setDiffDesc]       = useState('');
  const [description, setDescription] = useState('');
  const [clientIp, setClientIp]       = useState('');
  const [region, setRegion]           = useState('');
  const [gmt, setGmt]                 = useState('');
  const [isp, setIsp]                 = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [p3, setP3] = useState('');

  useEffect(() => {
    const t = setInterval(() => setLiveTime(kyivTime().time), 1000);
    return () => clearInterval(t);
  }, []);

  function showToast(type: 'success'|'error'|'loading', text: string) {
    setToast({ type, text });
    if (type !== 'loading') setTimeout(() => setToast(null), 4000);
  }

  function reset() {
    setAccountId(''); setProject(''); setDifficulty(''); setChatLink('');
    setClientEmail(''); setScreenshot(''); setDiffDesc(''); setDescription('');
    setClientIp(''); setRegion(''); setGmt(''); setIsp('');
    setP1(''); setP2(''); setP3('');
    setSendToTeams(false); setWebhook('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sendToTeams && !webhook) { showToast('error', 'Выбери куда отправить: PM или FinTech'); return; }
    const { time, date } = kyivTime();
    const data = { accountId, time, date, project, difficulty, difficultyDesc: diffDesc, description, chatLink, clientIp, clientEmail, region, gmt, isp, screenshot, amaticLoaded: '', bonusOffered: '', provider1: p1, provider2: p2, provider3: p3, webhook: sendToTeams ? webhook : '' };
    setSending(true);
    showToast('loading', 'Отправляем данные...');
    try {
      const res = await fetch(POWER_AUTOMATE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(String(res.status));
      setSendCount(c => c + 1);
      showToast('success', webhook ? `Отправлено (${webhook}) ✓` : 'Сохранено ✓');
      reset();
    } catch {
      showToast('error', 'Ошибка отправки. Открой F12 → Console.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ background: '#0d0f14', color: '#e8eaf0', minHeight: '100vh', padding: '40px 20px 80px', fontFamily: "'Manrope', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 780, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40, paddingBottom: 24, borderBottom: '1px solid #252a38' }}>
          <div style={{ width: 44, height: 44, background: 'rgba(61,134,245,0.15)', border: '1px solid rgba(61,134,245,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎯</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Новое обращение</h1>
            <p style={{ fontSize: 13, color: '#5a6070', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>support / tech-team</p>
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3d86f5', background: 'rgba(61,134,245,0.15)', border: '1px solid rgba(61,134,245,0.2)', padding: '6px 14px', borderRadius: 6 }}>{liveTime}</div>
        </div>

        <form onSubmit={submit}>
          <Section label="Основное">
            <Grid2>
              <F label="Айди аккаунта *"><input style={inputStyle} value={accountId} onChange={e=>setAccountId(e.target.value)} placeholder="напр. 1234567" required /></F>
              <F label="Проект *"><select style={selStyle} value={project} onChange={e=>setProject(e.target.value)} required><option value="">Выбрать проект...</option>{PROJECTS.map(p=><option key={p}>{p}</option>)}</select></F>
              <F label="Трудность *"><select style={selStyle} value={difficulty} onChange={e=>setDifficulty(e.target.value)} required><option value="">Выбрать трудность...</option>{DIFFICULTIES.map(d=><option key={d}>{d}</option>)}</select></F>
              <F label="Ссылка на чат или тикет *"><input style={inputStyle} value={chatLink} onChange={e=>setChatLink(e.target.value)} placeholder="https://..." required /></F>
              <div style={{ gridColumn: 'span 2' }}><F label="Почта клиента *"><input type="email" style={inputStyle} value={clientEmail} onChange={e=>setClientEmail(e.target.value)} placeholder="client@mail.com" required /></F></div>
            </Grid2>
          </Section>

          <Section label="Скриншот трудности">
            <F label=""><input style={inputStyle} value={screenshot} onChange={e=>setScreenshot(e.target.value)} placeholder="https://... ссылка на скриншот" /></F>
          </Section>

          <Section label="Описание">
            <F label="Краткое описание трудности"><input style={inputStyle} value={diffDesc} onChange={e=>setDiffDesc(e.target.value)} placeholder="Краткое описание..." /></F>
            <div style={{ marginTop: 12 }}><F label="Подробное описание"><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80, lineHeight: 1.5 }} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Дополнительные детали..." /></F></div>
          </Section>

          <Section label="Клиент">
            <Grid3>
              <F label="IP клиента"><input style={inputStyle} value={clientIp} onChange={e=>setClientIp(e.target.value)} placeholder="192.168.1.1" /></F>
              <F label="Регион"><input style={inputStyle} value={region} onChange={e=>setRegion(e.target.value)} placeholder="Город или область" /></F>
              <F label="GMT"><input style={inputStyle} value={gmt} onChange={e=>setGmt(e.target.value)} placeholder="напр. GMT+3" /></F>
              <F label="Интернет провайдер"><input style={inputStyle} value={isp} onChange={e=>setIsp(e.target.value)} placeholder="Интернет провайдер" /></F>
            </Grid3>
          </Section>

          <Section label="Провайдеры">
            <Grid3>
              <F label="Провайдер 1"><select style={selStyle} value={p1} onChange={e=>setP1(e.target.value)}><option value="">— не выбран —</option>{PROVIDERS.map(p=><option key={p}>{p}</option>)}</select></F>
              <F label="Провайдер 2"><select style={selStyle} value={p2} onChange={e=>setP2(e.target.value)}><option value="">— не выбран —</option>{PROVIDERS.map(p=><option key={p}>{p}</option>)}</select></F>
              <F label="Провайдер 3"><select style={selStyle} value={p3} onChange={e=>setP3(e.target.value)}><option value="">— не выбран —</option>{PROVIDERS.map(p=><option key={p}>{p}</option>)}</select></F>
            </Grid3>
          </Section>

          <Section label="Отправка в Teams">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12, fontSize: 13, fontWeight: 500 }}>
              <input type="checkbox" checked={sendToTeams} onChange={e=>{ setSendToTeams(e.target.checked); if (!e.target.checked) setWebhook(''); }} style={{ width: 16, height: 16, accentColor: '#3d86f5' }} />
              Отправить в Teams
            </label>
            {sendToTeams && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['PM','PM'],['FinTech','FinTech']].map(([val,label])=>(
                  <label key={val} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, background: webhook===val ? 'rgba(61,134,245,0.15)' : '#13161e', border: `1px solid ${webhook===val ? '#3d86f5' : '#252a38'}`, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                    <input type="radio" name="webhook" value={val} checked={webhook===val} onChange={()=>setWebhook(val)} style={{ display: 'none' }} />
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: val==='PM' ? '#3d86f5' : '#f5a623', flexShrink: 0 }} />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </Section>

          <div style={{ marginTop: 36, display: 'flex', alignItems: 'center', gap: 16 }}>
            <button type="button" onClick={reset} style={{ background: '#13161e', border: '1px solid #252a38', borderRadius: 10, color: '#8b92a5', padding: '14px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}>Очистить</button>
            <button type="submit" disabled={sending} style={{ flex: 1, background: '#3d86f5', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}>
              {sending ? 'Отправляем...' : 'Отправить обращение →'}
            </button>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5a6070', textAlign: 'right', marginTop: 8 }}>Отправлено за сессию: <span style={{ color: '#3d86f5', fontWeight: 700 }}>{sendCount}</span></div>
        </form>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 30, right: 30, padding: '14px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10, zIndex: 999, maxWidth: 360, background: toast.type==='success' ? 'rgba(45,212,160,0.15)' : toast.type==='error' ? 'rgba(245,69,90,0.1)' : 'rgba(61,134,245,0.15)', border: `1px solid ${toast.type==='success' ? 'rgba(45,212,160,0.3)' : toast.type==='error' ? 'rgba(245,69,90,0.3)' : 'rgba(61,134,245,0.3)'}`, color: toast.type==='success' ? '#2dd4a0' : toast.type==='error' ? '#f5455a' : '#3d86f5' }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#5a6070', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {label}
        <div style={{ flex: 1, height: 1, background: '#252a38' }} />
      </div>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>;
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>{children}</div>;
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{label && <label style={labelStyle}>{label}</label>}{children}</div>;
}
