import React, { useState, useRef } from 'react';
import BackButton from '@/components/BackButton';

// Metrics Analyzer — port of tl/main/index.html
// Two tabs (СГ / НК). Each needs a main export + a depositors file.
// CSAT spam-dislike dedup (same email bad rating within 24h is dropped).

type Row = unknown[];
interface WB { SheetNames: string[]; Sheets: Record<string, unknown>; }

const DEP_BRACKETS = [
  { key: '0', lo: 0, hi: 0 },
  { key: '1–4', lo: 1, hi: 4 },
  { key: '5–9', lo: 5, hi: 9 },
  { key: '10+', lo: 10, hi: 1e9 },
];

const NK_SERVICE = new Set(['operator_chat', 'regular', 'tg', 'vip', 'bot', 'очередь', 'privip']);
const NK_SKIP = (v: string) => v.startsWith('spam_scam') || v.startsWith('блок_системой');
const NK_CATS = ['Деп', 'Бон', 'Вывод', 'Аккаунт', 'Жалобы', 'По сайту', 'Другое'];

function mapNkCat(val: unknown): string | null {
  if (!val) return null;
  const v = String(val).toLowerCase().trim();
  if (NK_SERVICE.has(v)) return null;
  if (NK_SKIP(v)) return null;
  if (v.startsWith('деп')) return 'Деп';
  if (v.startsWith('бон') || v.startsWith('бонус')) return 'Бон';
  if (v.startsWith('вывод')) return 'Вывод';
  if (v.startsWith('аккаунт')) return 'Аккаунт';
  if (v.startsWith('жалоб') || v === 'complaints') return 'Жалобы';
  if (v.includes('сайт') || v.startsWith('по_сайту')) return 'По сайту';
  return 'Другое';
}

function parseFRT(s: unknown): number | null {
  if (!s || typeof s !== 'string') return null;
  let t = 0;
  const h = s.match(/(\d+)\s*час/); if (h) t += parseInt(h[1]) * 3600;
  const m = s.match(/(\d+)\s*минут/); if (m) t += parseInt(m[1]) * 60;
  const sec = s.match(/(\d+)\s*секунд/); if (sec) t += parseInt(sec[1]);
  return t > 0 ? t : null;
}
function fmtTime(sec: number | null): string {
  if (sec == null || isNaN(sec)) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  if (h > 0) return h + 'ч ' + m + 'м ' + s + 'с';
  if (m > 0) return m + 'м ' + s + 'с';
  return s + 'с';
}
function fmtPct(good: number, bad: number): { str: string; val: number | null; total: number } {
  const t = good + bad;
  if (t === 0) return { str: '—', val: null, total: 0 };
  const v = Math.round((good / t) * 1000) / 10;
  return { str: v.toFixed(1) + '%', val: v, total: t };
}
function csatClass(val: number | null): string {
  if (val == null) return '';
  if (val >= 80) return 'csat-good';
  if (val >= 65) return 'csat-mid';
  return 'csat-bad';
}
function avg(arr: number[]): number | null { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000);
  return null;
}

function buildSpamSet(allRows: Row[], iCSAT: number, iEmail: number, iDate: number): Set<number> {
  const allBad: { email: string; dt: Date; idx: number }[] = [];
  allRows.forEach((r, idx) => {
    if (r[iCSAT] === 'bad' && r[iEmail]) {
      const dt = parseDate(r[iDate]);
      if (dt) allBad.push({ email: String(r[iEmail]).toLowerCase().trim(), dt, idx });
    }
  });
  allBad.sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const spamSet = new Set<number>();
  const lastBad: Record<string, Date> = {};
  for (const { email, dt, idx } of allBad) {
    if (lastBad[email] && (dt.getTime() - lastBad[email].getTime()) < 86400000) spamSet.add(idx);
    else lastBad[email] = dt;
  }
  return spamSet;
}

function loadDepMap(wb: WB, XLSX: typeof import('xlsx'), skipSheets = 1): Record<string, number> {
  const emailDep: Record<string, number> = {};
  wb.SheetNames.slice(skipSheets).forEach((shName) => {
    const ws = wb.Sheets[shName];
    const rows = (XLSX.utils.sheet_to_json(ws as never, { header: 1, defval: null }) as Row[]).slice(1);
    rows.forEach((r) => {
      if (r[1] && r[4] != null) {
        const dep = parseInt(String(r[4]));
        if (!isNaN(dep)) emailDep[String(r[1]).toLowerCase().trim()] = dep;
      }
    });
  });
  return emailDep;
}

interface WorkRow { idx: number; csat: unknown; email: string; }
function calcDepCsat(workingData: WorkRow[], spamSet: Set<number>, emailDep: Record<string, number>) {
  const good: Record<string, number> = {}, bad: Record<string, number> = {};
  DEP_BRACKETS.forEach((b) => { good[b.key] = 0; bad[b.key] = 0; });
  workingData.forEach((r) => {
    if (!r.csat || spamSet.has(r.idx)) return;
    if (!r.email || !(r.email in emailDep)) return;
    const dep = emailDep[r.email];
    for (const b of DEP_BRACKETS) {
      if (dep >= b.lo && dep <= b.hi) {
        if (r.csat === 'good') good[b.key]++;
        else if (r.csat === 'bad') bad[b.key]++;
        break;
      }
    }
  });
  return { good, bad };
}

interface SGProjStat { reg_frt: number[]; vip_frt: number[]; reg_good: number; reg_bad: number; vip_good: number; vip_bad: number; }
interface SGResult {
  minDate: Date; maxDate: Date; sundayCount: number; workingCount: number; spamCount: number;
  PROJECTS: { key: string; label: string }[]; projStats: Record<string, SGProjStat>;
  vipFRTavg: number | null; vipGoodAll: number; vipBadAll: number; nobotGood: number; nobotBad: number;
  dep: { good: Record<string, number>; bad: Record<string, number> };
}

function computeSG(sgWbs: WB[], sgDep: WB, XLSX: typeof import('xlsx')): SGResult {
  let headers: Row | null = null;
  let rows: Row[] = [];
  for (const wb of sgWbs) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws as never, { header: 1, defval: null }) as Row[];
    if (!headers) headers = raw[0];
    rows = rows.concat(raw.slice(1).filter((r) => r[0] != null));
  }
  const C: Record<string, number> = {};
  (headers || []).forEach((h, i) => { if (h) C[String(h)] = i; });
  const iDate = C['Дата и время начала'], iSrc = C['Источник'], iEmail = C['Почта клиента'];
  const iOp1 = C['Ник оператора 1'], iFRT = C['Время первого ответа'], iCSAT = C['Оценка чата (CSAT)'];

  const spamSet = buildSpamSet(rows, iCSAT, iEmail, iDate);
  const emailDep = loadDepMap(sgDep, XLSX);

  const data = rows.map((r, idx) => {
    const dt = parseDate(r[iDate]);
    return {
      idx, dt, weekday: dt ? dt.getDay() : -1,
      src: (String(r[iSrc] || '')).trim(), email: (String(r[iEmail] || '')).toLowerCase().trim(),
      op1: r[iOp1], frt: parseFRT(r[iFRT]), csat: r[iCSAT],
    };
  });

  const validDates = data.map((r) => r.dt).filter(Boolean) as Date[];
  const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
  const sundayCount = data.filter((r) => r.weekday === 0).length;
  const workingData = data.filter((r) => r.weekday !== 0);

  const PROJECTS = [
    { key: 'cat', label: 'CAT' }, { key: 'daddy', label: 'Daddy' }, { key: 'gama', label: 'GAMA' },
    { key: 'kent', label: 'KENT' }, { key: 'kometa', label: 'Kometa' }, { key: 'mers', label: 'Mers' },
    { key: 'r7', label: 'R7' }, { key: 'arkada', label: 'Arkada' },
  ];
  const isRegular = (src: string) => { const s = src.toLowerCase(); return s.includes('regular') || s.includes(' tg'); };
  const isVIP = (src: string) => { const s = src.toLowerCase(); return (s.includes('vip') || s.includes('privip')) && !s.includes('vipmanager'); };

  const projStats: Record<string, SGProjStat> = {};
  PROJECTS.forEach((p) => { projStats[p.key] = { reg_frt: [], vip_frt: [], reg_good: 0, reg_bad: 0, vip_good: 0, vip_bad: 0 }; });
  const vipFRTAll: number[] = []; let vipGoodAll = 0, vipBadAll = 0;

  workingData.forEach((r) => {
    const s = r.src;
    PROJECTS.forEach((p) => {
      if (!s.toLowerCase().startsWith(p.key)) return;
      const st = projStats[p.key];
      const reg = isRegular(s), vip = isVIP(s);
      if (reg && r.frt != null) st.reg_frt.push(r.frt);
      if (vip && r.frt != null) { st.vip_frt.push(r.frt); vipFRTAll.push(r.frt); }
      if (!r.csat || spamSet.has(r.idx)) return;
      if (reg) { if (r.csat === 'good') st.reg_good++; else if (r.csat === 'bad') st.reg_bad++; }
      if (vip) { if (r.csat === 'good') { st.vip_good++; vipGoodAll++; } else if (r.csat === 'bad') { st.vip_bad++; vipBadAll++; } }
    });
  });

  let nobotGood = 0, nobotBad = 0;
  workingData.forEach((r) => {
    if (!r.csat || spamSet.has(r.idx) || !r.op1) return;
    if (r.csat === 'good') nobotGood++; else if (r.csat === 'bad') nobotBad++;
  });

  const dep = calcDepCsat(workingData, spamSet, emailDep);
  return {
    minDate, maxDate, sundayCount, workingCount: workingData.length, spamCount: spamSet.size,
    PROJECTS, projStats, vipFRTavg: avg(vipFRTAll), vipGoodAll, vipBadAll, nobotGood, nobotBad, dep,
  };
}

interface NKProjStat {
  frt: number[]; art: number[]; good: number; bad: number; nobot_good: number; nobot_bad: number;
  total_chats: number; cats: Record<string, number>; dep_good: Record<string, number>; dep_bad: Record<string, number>;
}
interface NKResult {
  minDate: Date; maxDate: Date; sundayCount: number; workingCount: number; spamCount: number;
  PROJECTS: { key: string; label: string }[]; projStats: Record<string, NKProjStat>;
}

function computeNK(nkMain: WB, nkDep: WB, XLSX: typeof import('xlsx')): NKResult {
  const ws = nkMain.Sheets[nkMain.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws as never, { header: 1, defval: null }) as Row[];
  const headers = raw[0];
  const rows = raw.slice(1).filter((r) => r[0] != null);

  const C: Record<string, number> = {};
  headers.forEach((h, i) => { if (h) C[String(h)] = i; });
  const iDate = C['Дата и время начала'], iSrc = C['Источник'], iEmail = C['Почта клиента'];
  const iOp1 = C['Ник оператора 1'], iFRT = C['Время первого ответа'], iART = C['Среднее время ответа'], iCSAT = C['Оценка чата (CSAT)'];
  const iCats = [1, 2, 3, 4, 5].map((n) => C['Категория ' + n]).filter((i) => i != null);

  const spamSet = buildSpamSet(rows, iCSAT, iEmail, iDate);
  const emailDepAtom: Record<string, number> = {}, emailDepMotor: Record<string, number> = {};
  // Sheet names may be Latin (atom/motor) or Cyrillic (Атом/Мотор)
  const isAtomSheet = (s: string) => s.toLowerCase().includes('atom') || s.toLowerCase().includes('атом');
  const isMotorSheet = (s: string) => s.toLowerCase().includes('motor') || s.toLowerCase().includes('мотор');
  nkDep.SheetNames.filter((s) => isAtomSheet(s) || isMotorSheet(s)).forEach((shName) => {
    const ws2 = nkDep.Sheets[shName];
    const rows2 = (XLSX.utils.sheet_to_json(ws2 as never, { header: 1, defval: null }) as Row[]).slice(1);
    const target = isAtomSheet(shName) ? emailDepAtom : emailDepMotor;
    rows2.forEach((r) => {
      if (r[1] && r[4] != null) {
        const dep = parseInt(String(r[4]));
        if (!isNaN(dep) && isFinite(dep)) target[String(r[1]).toLowerCase().trim()] = dep;
      }
    });
  });

  const data = rows.map((r, idx) => {
    const dt = parseDate(r[iDate]);
    const grp = (String(r[C['Группа']] || '')).toLowerCase().trim();
    const cats: string[] = [];
    for (const ci of iCats) { const c = mapNkCat(r[ci]); if (c && !cats.includes(c)) cats.push(c); }
    return {
      idx, dt, weekday: dt ? dt.getDay() : -1, src: (String(r[iSrc] || '')).trim(), grp,
      email: (String(r[iEmail] || '')).toLowerCase().trim(), op1: r[iOp1],
      frt: parseFRT(r[iFRT]), art: parseFRT(r[iART]), csat: r[iCSAT], cats,
    };
  });

  const validDates = data.map((r) => r.dt).filter(Boolean) as Date[];
  const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
  const sundayCount = data.filter((r) => r.weekday === 0).length;
  const workingData = data.filter((r) => r.weekday !== 0);

  const PROJECTS = [
    { key: 'atom', label: 'Atom', emailDep: emailDepAtom },
    { key: 'motor', label: 'Motor', emailDep: emailDepMotor },
  ];
  const projStats: Record<string, NKProjStat> = {};
  PROJECTS.forEach((p) => {
    projStats[p.key] = { frt: [], art: [], good: 0, bad: 0, nobot_good: 0, nobot_bad: 0, total_chats: 0, cats: {}, dep_good: {}, dep_bad: {} };
    NK_CATS.forEach((c) => { projStats[p.key].cats[c] = 0; });
    DEP_BRACKETS.forEach((b) => { projStats[p.key].dep_good[b.key] = 0; projStats[p.key].dep_bad[b.key] = 0; });
  });

  workingData.forEach((r) => {
    const p = PROJECTS.find((p) => p.key === r.grp);
    if (!p) return;
    const st = projStats[p.key];
    st.total_chats++;
    if (r.frt != null) st.frt.push(r.frt);
    if (r.art != null) st.art.push(r.art);
    r.cats.forEach((c) => { if (NK_CATS.includes(c)) st.cats[c]++; });
    if (!r.csat || spamSet.has(r.idx)) return;
    if (r.csat === 'good') st.good++; else if (r.csat === 'bad') st.bad++;
    if (r.op1) { if (r.csat === 'good') st.nobot_good++; else if (r.csat === 'bad') st.nobot_bad++; }
    const dep = p.emailDep[r.email];
    if (dep != null) {
      for (const b of DEP_BRACKETS) {
        if (dep >= b.lo && dep <= b.hi) { if (r.csat === 'good') st.dep_good[b.key]++; else if (r.csat === 'bad') st.dep_bad[b.key]++; break; }
      }
    }
  });

  return { minDate, maxDate, sundayCount, workingCount: workingData.length, spamCount: spamSet.size, PROJECTS, projStats };
}

const fmtD = (d: Date | null) => (d ? d.toLocaleDateString('ru-RU') : '?');

function InfoRow({ r }: { r: { minDate: Date; maxDate: Date; workingCount: number; sundayCount: number; spamCount: number } }) {
  return (
    <div className="info-row">
      <div className="info-item">Период: <span>{fmtD(r.minDate)} — {fmtD(r.maxDate)}</span></div>
      <div className="info-item">Рабочих строк: <span>{r.workingCount.toLocaleString('ru')}</span></div>
      <div className="info-item">Воскресенье (не в расчёте): <span>{r.sundayCount.toLocaleString('ru')}</span></div>
      <div className="info-item">Спам-дизлайков отфильтровано: <span>{r.spamCount}</span></div>
    </div>
  );
}

function RenderSG({ r }: { r: SGResult }) {
  const { PROJECTS, projStats, vipFRTavg, vipGoodAll, vipBadAll, nobotGood, nobotBad, dep } = r;
  const vipAll = fmtPct(vipGoodAll, vipBadAll);
  const nobot = fmtPct(nobotGood, nobotBad);
  return (
    <div className="results">
      <InfoRow r={r} />
      <div className="section-title">Время первого ответа (среднее)</div>
      <table className="metrics-table"><thead><tr><th>Проект</th><th>Regular + TG</th><th>VIP + Privip</th></tr></thead><tbody>
        {PROJECTS.map((p) => { const st = projStats[p.key]; return (
          <tr key={p.key}><td className="proj">{p.label}</td><td className="val">{fmtTime(avg(st.reg_frt))}</td><td className="val">{fmtTime(avg(st.vip_frt))}</td></tr>
        ); })}
        <tr className="vip-row"><td className="proj">VIP (все проекты)</td><td className="val">—</td><td className="val">{fmtTime(vipFRTavg)}</td></tr>
      </tbody></table>
      <div className="section-title">CSAT</div>
      <table className="metrics-table"><thead><tr><th>Проект</th><th>Regular + TG</th><th>VIP + Privip</th></tr></thead><tbody>
        {PROJECTS.map((p) => {
          const st = projStats[p.key]; const reg = fmtPct(st.reg_good, st.reg_bad); const vip = fmtPct(st.vip_good, st.vip_bad);
          return (
            <tr key={p.key}>
              <td className="proj">{p.label}</td>
              <td className={'val ' + csatClass(reg.val)}>{reg.str} <small style={{ color: '#475569', fontSize: 11 }}>({reg.total})</small></td>
              <td className={'val ' + csatClass(vip.val)}>{vip.str} <small style={{ color: '#475569', fontSize: 11 }}>({vip.total})</small></td>
            </tr>
          );
        })}
        <tr className="vip-row"><td className="proj">VIP (все проекты)</td><td className="val">—</td>
          <td className={'val ' + csatClass(vipAll.val)}>{vipAll.str} <small style={{ color: '#475569', fontSize: 11 }}>({vipAll.total})</small></td></tr>
      </tbody></table>
      <div className="section-title">CSAT without Bot</div>
      <div className="cards-row"><div className="card">
        <div className="lbl">CSAT без бота</div>
        <div className={'val ' + csatClass(nobot.val)}>{nobot.str}</div>
        <div className="sub">{nobotGood} лайков / {nobotBad} дизлайков ({nobot.total} всего)</div>
      </div></div>
      <div className="section-title">CSAT по депозитам</div>
      <div className="dep-grid">
        {DEP_BRACKETS.map((b) => { const g = dep.good[b.key], bd = dep.bad[b.key]; const p = fmtPct(g, bd); return (
          <div className="dep-card" key={b.key}>
            <div className="dep-lbl">Депозиты: {b.key}</div>
            <div className={'dep-val ' + csatClass(p.val)}>{p.str}</div>
            <div className="dep-sub">{g} лайков / {bd} дизлайков<br />{p.total} оценок</div>
          </div>
        ); })}
      </div>
    </div>
  );
}

function RenderNK({ r }: { r: NKResult }) {
  const { PROJECTS, projStats } = r;
  return (
    <div className="results">
      <InfoRow r={r} />
      <div className="section-title">Проекты</div>
      <div className="nk-projects">
        {PROJECTS.map((p) => {
          const st = projStats[p.key]; const csat = fmtPct(st.good, st.bad); const nobot = fmtPct(st.nobot_good, st.nobot_bad);
          const maxCat = Math.max(...NK_CATS.map((c) => st.cats[c]));
          return (
            <div className="nk-proj-card" key={p.key}>
              <div className="nk-proj-header">{p.label}</div>
              <div className="nk-proj-body">
                <div className="nk-row"><span className="nk-lbl">Чатов всего</span><span className="nk-val">{st.total_chats.toLocaleString('ru')}</span></div>
                <div className="nk-row"><span className="nk-lbl">Время первого ответа</span><span className="nk-val">{fmtTime(avg(st.frt))}</span></div>
                <div className="nk-row"><span className="nk-lbl">Время между ответами</span><span className="nk-val">{fmtTime(avg(st.art))}</span></div>
                <div className="nk-row"><span className="nk-lbl">CSAT</span><span className={'nk-val ' + csatClass(csat.val)}>{csat.str} <small style={{ color: '#475569', fontSize: 11 }}>({csat.total})</small></span></div>
                <div className="nk-row"><span className="nk-lbl">CSAT без бота</span><span className={'nk-val ' + csatClass(nobot.val)}>{nobot.str} <small style={{ color: '#475569', fontSize: 11 }}>({nobot.total})</small></span></div>
                <div style={{ marginTop: 12, marginBottom: 6, fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.7px', textTransform: 'uppercase' }}>CSAT по депозитам</div>
                {DEP_BRACKETS.map((b) => { const g = st.dep_good[b.key], bd = st.dep_bad[b.key]; const dp = fmtPct(g, bd); return (
                  <div className="nk-row" key={b.key}><span className="nk-lbl">Деп {b.key}</span><span className={'nk-val ' + csatClass(dp.val)}>{dp.str} <small style={{ color: '#475569', fontSize: 11 }}>({dp.total})</small></span></div>
                ); })}
                <div style={{ marginTop: 12, marginBottom: 6, fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.7px', textTransform: 'uppercase' }}>Категории обращений</div>
                <table className="cat-table"><tbody>
                  {NK_CATS.map((c) => {
                    const cnt = st.cats[c]; const barW = maxCat > 0 ? Math.round((cnt / maxCat) * 100) : 0;
                    const total = st.total_chats; const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) + '%' : '—';
                    return (
                      <tr key={c}>
                        <td className="cat-lbl" style={{ width: 90 }}>{c}</td>
                        <td className="cat-bar-wrap"><div className="cat-bar" style={{ width: barW + '%' }} /></td>
                        <td className="cat-val" style={{ width: 60 }}>{cnt.toLocaleString('ru')}</td>
                        <td className="cat-val" style={{ width: 50, color: '#64748b' }}>{pct}</td>
                      </tr>
                    );
                  })}
                </tbody></table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CSS = `
.tlmain { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }
.tlmain .header { background: #1a1d27; border-bottom: 1px solid #2d3148; padding: 18px 32px; display: flex; align-items: center; gap: 12px; }
.tlmain .header h1 { font-size: 19px; font-weight: 600; color: #fff; }
.tlmain .badge { background: #6366f1; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.5px; }
.tlmain .tabs { display: flex; border-bottom: 1px solid #2d3148; background: #1a1d27; padding: 0 32px; }
.tlmain .tab-btn { background: none; border: none; color: #64748b; font-size: 14px; font-weight: 500; padding: 14px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tlmain .tab-btn:hover { color: #94a3b8; }
.tlmain .tab-btn.active { color: #a5b4fc; border-bottom-color: #6366f1; }
.tlmain .upload-zone { padding: 28px 32px 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 860px; }
.tlmain .drop-card { border: 1.5px dashed #2d3148; border-radius: 12px; padding: 22px; text-align: center; cursor: pointer; background: #1a1d27; position: relative; }
.tlmain .drop-card:hover { border-color: #6366f1; background: #1e2036; }
.tlmain .drop-card.loaded { border-color: #22c55e; border-style: solid; }
.tlmain .drop-card input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.tlmain .drop-icon { font-size: 28px; margin-bottom: 10px; }
.tlmain .drop-label { font-size: 13px; font-weight: 500; color: #94a3b8; margin-bottom: 3px; }
.tlmain .drop-hint { font-size: 11px; color: #475569; }
.tlmain .drop-name { font-size: 12px; color: #22c55e; margin-top: 7px; font-weight: 500; }
.tlmain .btn-analyze { display: block; margin: 20px 32px 0; background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 11px 32px; font-size: 14px; font-weight: 600; cursor: pointer; }
.tlmain .btn-analyze:hover { background: #4f46e5; }
.tlmain .btn-analyze:disabled { background: #2d3148; color: #475569; cursor: not-allowed; }
.tlmain .results { padding: 0 32px 48px; max-width: 1200px; }
.tlmain .section-title { font-size: 12px; font-weight: 700; color: #6366f1; letter-spacing: 1px; text-transform: uppercase; margin: 28px 0 14px; }
.tlmain .metrics-table { width: 100%; border-collapse: collapse; background: #1a1d27; border-radius: 10px; overflow: hidden; border: 1px solid #2d3148; }
.tlmain .metrics-table th { background: #141621; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.7px; padding: 9px 15px; text-align: left; border-bottom: 1px solid #2d3148; }
.tlmain .metrics-table td { padding: 10px 15px; font-size: 13px; border-bottom: 1px solid #1e2235; color: #e2e8f0; }
.tlmain .metrics-table tr:last-child td { border-bottom: none; }
.tlmain .metrics-table td.proj { font-weight: 600; color: #fff; }
.tlmain .metrics-table td.val { font-variant-numeric: tabular-nums; color: #a5b4fc; }
.tlmain .csat-good { color: #22c55e; } .tlmain .csat-mid { color: #f59e0b; } .tlmain .csat-bad { color: #ef4444; }
.tlmain .cards-row { display: flex; gap: 12px; flex-wrap: wrap; }
.tlmain .card { background: #1a1d27; border: 1px solid #2d3148; border-radius: 10px; padding: 16px 20px; min-width: 160px; flex: 1; }
.tlmain .card .lbl { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px; }
.tlmain .card .val { font-size: 22px; font-weight: 700; color: #a5b4fc; }
.tlmain .card .sub { font-size: 11px; color: #475569; margin-top: 4px; }
.tlmain .dep-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 11px; }
.tlmain .dep-card { background: #1a1d27; border: 1px solid #2d3148; border-radius: 10px; padding: 14px 18px; }
.tlmain .dep-card .dep-lbl { font-size: 11px; color: #64748b; font-weight: 600; margin-bottom: 5px; }
.tlmain .dep-card .dep-val { font-size: 22px; font-weight: 700; }
.tlmain .dep-card .dep-sub { font-size: 11px; color: #475569; margin-top: 3px; }
.tlmain .nk-projects { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.tlmain .nk-proj-card { background: #1a1d27; border: 1px solid #2d3148; border-radius: 12px; overflow: hidden; }
.tlmain .nk-proj-header { background: #141621; padding: 12px 18px; font-size: 14px; font-weight: 700; color: #c4b5fd; border-bottom: 1px solid #2d3148; }
.tlmain .nk-proj-body { padding: 14px 18px; }
.tlmain .nk-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #1e2235; font-size: 13px; }
.tlmain .nk-row:last-child { border-bottom: none; }
.tlmain .nk-row .nk-lbl { color: #94a3b8; }
.tlmain .nk-row .nk-val { font-weight: 600; color: #a5b4fc; }
.tlmain .nk-row .nk-val.csat-good { color: #22c55e; } .tlmain .nk-row .nk-val.csat-mid { color: #f59e0b; } .tlmain .nk-row .nk-val.csat-bad { color: #ef4444; }
.tlmain .cat-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
.tlmain .cat-table td { padding: 5px 0; border-bottom: 1px solid #1e2235; }
.tlmain .cat-lbl { color: #94a3b8; }
.tlmain .cat-val { text-align: right; font-weight: 600; color: #e2e8f0; }
.tlmain .cat-bar-wrap { padding: 2px 8px; }
.tlmain .cat-bar { height: 4px; background: #6366f1; border-radius: 2px; }
.tlmain .info-row { display: flex; gap: 20px; flex-wrap: wrap; background: #141621; border-radius: 8px; padding: 10px 15px; margin: 20px 0 4px; }
.tlmain .info-item { font-size: 11px; color: #64748b; }
.tlmain .info-item span { color: #94a3b8; font-weight: 500; }
.tlmain .err { background: #1f1315; border: 1px solid #7f1d1d; border-radius: 8px; padding: 14px; color: #fca5a5; font-size: 13px; margin: 16px 0; }
.tlmain .vip-row td { background: #1a1b36 !important; } .tlmain .vip-row td.proj { color: #c4b5fd !important; }
`;

export default function TLMainPage() {
  const [tab, setTab] = useState<'sg' | 'nk'>('sg');
  const sgMain = useRef<WB[]>([]);
  const sgDep = useRef<WB | null>(null);
  const nkMain = useRef<WB | null>(null);
  const nkDep = useRef<WB | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [sgOut, setSgOut] = useState<React.ReactNode>(null);
  const [nkOut, setNkOut] = useState<React.ReactNode>(null);
  const [, force] = useState(0);

  async function readWB(file: File): Promise<WB> {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    return XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true }) as unknown as WB;
  }

  async function onSgMain(files: FileList | null) {
    if (!files || !files.length) return;
    setNames((n) => ({ ...n, sgMain: '⏳ Загрузка...' }));
    const wbs: WB[] = [];
    for (const f of Array.from(files)) wbs.push(await readWB(f));
    sgMain.current = wbs;
    setNames((n) => ({ ...n, sgMain: files.length === 1 ? '✓ ' + files[0].name : '✓ ' + files.length + ' файла(ов) загружено' }));
    force((x) => x + 1);
  }
  async function onFile(key: 'sgDep' | 'nkMain' | 'nkDep', file: File | null) {
    if (!file) return;
    setNames((n) => ({ ...n, [key]: '⏳ Загрузка...' }));
    try {
      const wb = await readWB(file);
      if (key === 'sgDep') sgDep.current = wb;
      else if (key === 'nkMain') nkMain.current = wb;
      else nkDep.current = wb;
      setNames((n) => ({ ...n, [key]: '✓ ' + file.name }));
      force((x) => x + 1);
    } catch { setNames((n) => ({ ...n, [key]: '✗ Ошибка чтения' })); }
  }

  const sgReady = sgMain.current.length > 0 && !!sgDep.current;
  const nkReady = !!nkMain.current && !!nkDep.current;

  async function analyze(which: 'sg' | 'nk') {
    const XLSX = await import('xlsx');
    try {
      if (which === 'sg') setSgOut(<RenderSG r={computeSG(sgMain.current, sgDep.current!, XLSX)} />);
      else setNkOut(<RenderNK r={computeNK(nkMain.current!, nkDep.current!, XLSX)} />);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const node = <div className="results"><div className="err">Ошибка: {msg}</div></div>;
      if (which === 'sg') setSgOut(node); else setNkOut(node);
    }
  }

  return (
    <div className="tlmain" style={{ paddingTop: 56 }}>
      <style>{CSS}</style>
      <BackButton to="/tl" />
      <div className="header"><h1>Metrics Analyzer</h1><div className="badge">MEET</div></div>
      <div className="tabs">
        <button className={'tab-btn' + (tab === 'sg' ? ' active' : '')} onClick={() => setTab('sg')}>СГ проекты</button>
        <button className={'tab-btn' + (tab === 'nk' ? ' active' : '')} onClick={() => setTab('nk')}>НК проекты</button>
      </div>
      {tab === 'sg' && (
        <div>
          <div className="upload-zone">
            <div className={'drop-card' + (sgMain.current.length ? ' loaded' : '')}>
              <input type="file" accept=".xlsx,.xls" multiple onChange={(e) => onSgMain(e.target.files)} />
              <div className="drop-icon">📊</div><div className="drop-label">Основная выгрузка</div>
              <div className="drop-hint">Можно загрузить несколько файлов сразу</div>
              <div className="drop-name">{names.sgMain}</div>
            </div>
            <div className={'drop-card' + (sgDep.current ? ' loaded' : '')}>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => onFile('sgDep', e.target.files?.[0] || null)} />
              <div className="drop-icon">💰</div><div className="drop-label">Файл депозиторов</div>
              <div className="drop-hint">Аналитика_CSAT_SG_*.xlsx</div>
              <div className="drop-name">{names.sgDep}</div>
            </div>
          </div>
          <button className="btn-analyze" disabled={!sgReady} onClick={() => analyze('sg')}>Рассчитать метрики СГ</button>
          {sgOut}
        </div>
      )}
      {tab === 'nk' && (
        <div>
          <div className="upload-zone">
            <div className={'drop-card' + (nkMain.current ? ' loaded' : '')}>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => onFile('nkMain', e.target.files?.[0] || null)} />
              <div className="drop-icon">📊</div><div className="drop-label">Основная выгрузка</div>
              <div className="drop-hint">all_conversation_metrics_*.xlsx</div>
              <div className="drop-name">{names.nkMain}</div>
            </div>
            <div className={'drop-card' + (nkDep.current ? ' loaded' : '')}>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => onFile('nkDep', e.target.files?.[0] || null)} />
              <div className="drop-icon">💰</div><div className="drop-label">Файл депозиторов</div>
              <div className="drop-hint">Аналитика_CSAT_NK_*.xlsx</div>
              <div className="drop-name">{names.nkDep}</div>
            </div>
          </div>
          <button className="btn-analyze" disabled={!nkReady} onClick={() => analyze('nk')}>Рассчитать метрики НК</button>
          {nkOut}
        </div>
      )}
    </div>
  );
}
