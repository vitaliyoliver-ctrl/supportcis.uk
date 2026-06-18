import React, { useState, useEffect } from 'react';
import BackButton from '@/components/BackButton';

const POWER_AUTOMATE_URL = "https://defaulte2f944de9f4f4231833c439e8d8d9b.8f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/4b42a25db10b42539036775887232fe4/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=Pj4VM8rAJY8uilnObkX40O0PtT1lI8DN4-B8RznRMGo";

const PROVIDERS = ['Все провайдеры','3 Oaks Gaming','4ThePlayer','Amatic','Amusnet','AvatarUX','Aviatrix','Bang Bang','Belatra','BetSoft','BGaming','Big Time Gaming','Boomerang','Devxpress','ELK Studios','Endorphina','Evolution','Evoplay','Ezugi','Fugaso','Galaxsys','GameArt','Gamzix','HacksawGaming','Hot Rise','ICONIC21','Igrosoft','ISoftBet','Mascot Gaming','Microgaming','NetEnt','NetGame','Nolimit City','Novomatic','Onlyplay','PeterAndSons','PG Soft','Platipus',"Play'n GO",'Playson','PopiPlay','Pragmatic Play','Pragmatic Play Live','Print Studios','Push Gaming','Quickspin','Red Tiger','RedRakeGaming','Reel Play','Reflex Gaming','Relax Gaming','RubyPlay','Skillzz','SmartSoft','Spinomenal','SpinOn','Spribe','Thunderkick','TomHornGaming','TurboGames','Upgaming','Wazdan','Yggdrasil'];
const NC_PROJECTS = ['MOTOR','ATOM'];
const DIFFICULTIES = ['Не работает сайт','Не работают слоты','Не грузятся картинки','Не может сделать депозит','Не может сделать вывод','Не работает чат','Проблемы с бонусами','Другое'];
const NC_WEBHOOKS = [
  { val: 'MOTOR_PM',  label: 'MOTOR — PM',   color: '#3d86f5' },
  { val: 'MOTOR_PSP', label: 'MOTOR — PSP',  color: '#f5a623' },
  { val: 'ATOM_PM',   label: 'Атом — PM',    color: '#a78bfa' },
  { val: 'ATOM_PSP',  label: 'Атом — PSP',   color: '#34d399' },
  { val: 'OTHER',     label: 'Другое',        color: '#6b7280' },
];

function kyivTime() {
  const kyiv = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return { time: `${pad(kyiv.getHours())}:${pad(kyiv.getMinutes())}:${pad(kyiv.getSeconds())}`, date: `${pad(kyiv.getDate())}.${pad(kyiv.getMonth()+1)}.${kyiv.getFullYear()}` };
}

const inputStyle: React.CSSProperties = { width: '100%', background: '#13161e', border: '1px solid #252a38', borderRadius: 8, color: '#e8eaf0', fontFamily: "'Manrope', sans-serif", fontSize: 14, padding: '10px 14px', outline: 'none' };
const selStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', appearance: 'none' as const };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#8b92a5', display: 'block', marginBottom: 6 };

export default function ReportNcPage() {
  const [liveTime, setLiveTime] = useState('--:--:--');
  const [sending, setSending] = useState(false);
  const [sendCount, setSendCount] = useState(0);
  const [toast, setToast] = useState<{ type: 'success'|'error'|'loading'; text: string } | null>(null);
  const [sendToTeams, setSendToTeams] = useState(false);
  const [webhook, setWebhook] = useState('');
  const [transferNote, setTransferNote] = useState('');

  const [accountId, setAccountId]     = useState('');
  const [project, setProject]         = useState('');
  const [difficulty, setDifficulty]   = useState('');
  const [chatLink, setChatLink]       = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [screenshot, setScreenshot]   = useState('');
  const [diffDesc, setDiffDesc]       = useState('');
  const [clientIp, setClientIp]       = useState('');
  const [region, setRegion]           = useState('');
  const [gmt, setGmt]                 = useState('');
  const [isp, setIsp]                 = useState('');
  const [mirror, setMirror]           = useState('');
  const [advAdblock, setAdvAdblock]   = useState(false);
  const [advAptechka, setAdvAptechka] = useState(false);
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
    setClientEmail(''); setScreenshot(''); setDiffDesc('');
    setClientIp(''); setRegion(''); setGmt(''); setIsp(''); setMirror('');
    setAdvAdblock(false); setAdvAptechka(false);
    setP1(''); setP2(''); setP3('');
    setSendToTeams(false); setWebhook(''); setTransferNote('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sendToTeams && !webhook) { showToast('error', 'Выбери куда отправить в Teams'); return; }
    const { time, date } = kyivTime();
    const data = { accountId, time, date, project, difficulty, difficultyDesc: diffDesc, chatLink, clientIp, clientEmail, region, gmt, isp, mirror, screenshot, advAdblock: advAdblock ? 'Да' : '', advAptechka: advAptechka ? 'Да' : '', provider1: p1, provider2: p2, provider3: p3, webhook: sendToTeams ? webhook : '', transferNote: webhook === 'OTHER' ? transferNote : '' };
    setSending(true);
    showToast('loading', 'Отправляем данные...');
    try {
      const res = await fetch(POWER_AUTOMATE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(String(res.status));
      setSendCount(c => c + 1);
      const label = webhook === 'OTHER' ? `Передано (${transferNote || 'другое'})` : webhook ? `Отправлено (${webhook.replace('_', ' — ')})` : 'Сохранено в Excel';
      showToast('success', label + ' ✓');
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
          <BackButton to="/support" inline />
          <div style={{ width: 44, height: 44, background: 'rgba(61,134,245,0.15)', border: '1px solid rgba(61,134,245,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎯</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Новое обращение</h1>
            <p style={{ fontSize: 13, color: '#5a6070', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>support / nk-team · /support/report-nc</p>
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3d86f5', background: 'rgba(61,134,245,0.15)', border: '1px solid rgba(61,134,245,0.2)', padding: '6px 14px', borderRadius: 6 }}>{liveTime}</div>
        </div>

        <form onSubmit={submit}>
          <Sec label="Основное">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Fld label="Айди аккаунта *"><input style={inputStyle} value={accountId} onChange={e=>setAccountId(e.target.value)} placeholder="напр. 1234567" required /></Fld>
              <Fld label="Проект *"><select style={selStyle} value={project} onChange={e=>setProject(e.target.value)} required><option value="">Выбрать проект...</option>{NC_PROJECTS.map(p=><option key={p}>{p}</option>)}</select></Fld>
              <Fld label="Трудность *"><select style={selStyle} value={difficulty} onChange={e=>setDifficulty(e.target.value)} required><option value="">Выбрать трудность...</option>{DIFFICULTIES.map(d=><option key={d}>{d}</option>)}</select></Fld>
              <Fld label="Ссылка на чат или тикет *"><input style={inputStyle} value={chatLink} onChange={e=>setChatLink(e.target.value)} placeholder="https://..." required /></Fld>
              <div style={{ gridColumn: 'span 2' }}><Fld label="Почта клиента *"><input type="email" style={inputStyle} value={clientEmail} onChange={e=>setClientEmail(e.target.value)} placeholder="client@mail.com" required /></Fld></div>
            </div>
          </Sec>

          <Sec label="Скриншот трудности">
            <Fld label=""><input style={inputStyle} value={screenshot} onChange={e=>setScreenshot(e.target.value)} placeholder="https://... ссылка на скриншот" /></Fld>
          </Sec>

          <Sec label="Описание">
            <Fld label="Краткое описание трудности"><input style={inputStyle} value={diffDesc} onChange={e=>setDiffDesc(e.target.value)} placeholder="Краткое описание..." /></Fld>
          </Sec>

          <Sec label="Клиент">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Fld label="IP клиента"><input style={inputStyle} value={clientIp} onChange={e=>setClientIp(e.target.value)} placeholder="192.168.1.1" /></Fld>
              <Fld label="Регион"><input style={inputStyle} value={region} onChange={e=>setRegion(e.target.value)} placeholder="Город или область" /></Fld>
              <Fld label="GMT"><input style={inputStyle} value={gmt} onChange={e=>setGmt(e.target.value)} placeholder="напр. GMT+3" /></Fld>
              <Fld label="Интернет провайдер"><input style={inputStyle} value={isp} onChange={e=>setIsp(e.target.value)} placeholder="Интернет провайдер" /></Fld>
              <Fld label="Зеркало"><input style={inputStyle} value={mirror} onChange={e=>setMirror(e.target.value)} placeholder="Зеркало клиента" /></Fld>
            </div>
          </Sec>

          <Sec label="Советы">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[['advAdblock','Совет выключить AdBlock',advAdblock,setAdvAdblock],['advAptechka','Совет использовать аптечку',advAptechka,setAdvAptechka]].map(([id,label,val,set])=>(
                <label key={id as string} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#13161e', border: '1px solid #252a38', borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  <input type="checkbox" checked={val as boolean} onChange={e=>(set as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#3d86f5' }} />
                  {label as string}
                </label>
              ))}
            </div>
          </Sec>

          <Sec label="Провайдеры">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Fld label="Провайдер 1"><select style={selStyle} value={p1} onChange={e=>setP1(e.target.value)}><option value="">— не выбран —</option>{PROVIDERS.map(p=><option key={p}>{p}</option>)}</select></Fld>
              <Fld label="Провайдер 2"><select style={selStyle} value={p2} onChange={e=>setP2(e.target.value)}><option value="">— не выбран —</option>{PROVIDERS.map(p=><option key={p}>{p}</option>)}</select></Fld>
              <Fld label="Провайдер 3"><select style={selStyle} value={p3} onChange={e=>setP3(e.target.value)}><option value="">— не выбран —</option>{PROVIDERS.map(p=><option key={p}>{p}</option>)}</select></Fld>
            </div>
          </Sec>

          <Sec label="Отправка в Teams">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12, fontSize: 13, fontWeight: 500 }}>
              <input type="checkbox" checked={sendToTeams} onChange={e=>{ setSendToTeams(e.target.checked); if (!e.target.checked) { setWebhook(''); setTransferNote(''); } }} style={{ width: 16, height: 16, accentColor: '#3d86f5' }} />
              Отправить в Teams
            </label>
            {sendToTeams && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {NC_WEBHOOKS.map(({ val, label, color }) => (
                    <label key={val} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, background: webhook===val ? 'rgba(61,134,245,0.15)' : '#13161e', border: `1px solid ${webhook===val ? '#3d86f5' : '#252a38'}`, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      <input type="radio" name="webhook" value={val} checked={webhook===val} onChange={()=>setWebhook(val)} style={{ display: 'none' }} />
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                      {label}
                    </label>
                  ))}
                </div>
                {webhook === 'OTHER' && (
                  <div style={{ marginTop: 10 }}>
                    <Fld label="Куда передали"><input style={inputStyle} value={transferNote} onChange={e=>setTransferNote(e.target.value)} placeholder="Укажи куда передали обращение" /></Fld>
                  </div>
                )}
              </>
            )}
          </Sec>

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
        <div style={{ position: 'fixed', bottom: 30, right: 30, padding: '14px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 999, background: toast.type==='success' ? 'rgba(45,212,160,0.15)' : toast.type==='error' ? 'rgba(245,69,90,0.1)' : 'rgba(61,134,245,0.15)', border: `1px solid ${toast.type==='success' ? 'rgba(45,212,160,0.3)' : toast.type==='error' ? 'rgba(245,69,90,0.3)' : 'rgba(61,134,245,0.3)'}`, color: toast.type==='success' ? '#2dd4a0' : toast.type==='error' ? '#f5455a' : '#3d86f5' }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Sec({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 28 }}><div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#5a6070', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>{label}<div style={{ flex: 1, height: 1, background: '#252a38' }} /></div>{children}</div>;
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{label && <label style={labelStyle}>{label}</label>}{children}</div>;
}
