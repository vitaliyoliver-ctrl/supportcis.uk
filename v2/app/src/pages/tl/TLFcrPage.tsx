import React, { useState, useEffect, useRef, useCallback } from 'react';

// FCR Calculator — port of tl/fcr/index.html
// Processes LiveChat and Chatwoot CSV/XLSX exports to compute First Contact Resolution

const TL_LABELS: Record<string, string> = { vip: 'VIP', privip: 'PreVIP', regular: 'Regular', tg: 'Telegram', unknown: '—' };

function cl(v: unknown): string {
  if (v == null) return '';
  let s = String(v).replace(/^﻿/, '').trim();
  if (s === 'None' || s === 'none' || s === 'null') return '';
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") s = s.slice(1, -1);
  return s.trim();
}

function isLCBot(n: string) {
  if (!n) return false;
  const p = n.trim().split(/\s+/);
  return p.length >= 2 && /^[A-Z]/.test(p[0]) && /^[A-Z]/.test(p[1]);
}
function isPrvBot(n: string) { return isLCBot(n) && /\bM\.\s*$/.test(n); }
function botBase(n: string) { return n.replace(/\s+M\.\s*$/, '').trim(); }

function csvParse(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { cur.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(f); f = '';
      if (cur.length > 1 || cur[0] !== '') rows.push(cur);
      cur = [];
    } else f += c;
  }
  cur.push(f);
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  return rows;
}

function findCol(h: string[], names: string[]): number {
  for (const name of names) { const idx = h.findIndex(c => c.toLowerCase().includes(name.toLowerCase())); if (idx >= 0) return idx; }
  return -1;
}
function findCols(h: string[], patterns: string[]): number[] {
  const res: number[] = [];
  for (let i = 0; i < h.length; i++) { for (const p of patterns) { if (h[i].toLowerCase().includes(p.toLowerCase())) { res.push(i); break; } } }
  return res;
}
function findOpCols(h: string[]): number[] {
  const res: number[] = [];
  for (let i = 0; i < h.length; i++) {
    const lo = h[i].toLowerCase();
    if ((lo.includes('operator name') || lo.includes('ник оператора')) && !lo.includes('duration') && !lo.includes('длительность')) res.push(i);
  }
  return res;
}
function detect(h: string[]): 'livechat' | 'chatwoot' {
  const j = h.join(' ');
  if (j.includes('conversation id') || j.includes('id чата') || j.includes('источник')) return 'chatwoot';
  return 'livechat';
}

interface Chat {
  confId: string; date: string; dateOnly: string; visitorId: string;
  lastOp: string; tags: string[]; project: string; tier: string;
  hasBot: boolean; hasHuman: boolean; botName: string;
}

function parseLC(rows: string[][]): Chat[] {
  if (rows.length < 2) return [];
  const h = rows[0].map(c => cl(c));
  const ic = h.indexOf('conferenceId'), id = findCol(h, ['chat creation date']), ig = findCol(h, ['group name']), iv = findCol(h, ['visitor livechat id']);
  const oc: number[] = [], tc: number[] = [];
  for (let i = 0; i < h.length; i++) {
    if (/^operator \d+ nick$/.test(h[i])) oc.push(i);
    if (/^tag \d+$/.test(h[i])) tc.push(i);
  }
  const data: Chat[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (row.length < 10) continue;
    const cid = cl(row[ic]); if (!cid) continue;
    const ds = cl(row[id]), gr = cl(row[ig]), vid = cl(row[iv]);
    const ops: string[] = []; for (const o of oc) { const v = cl(row[o]); if (v) ops.push(v); }
    const hb = ops.some(o => isLCBot(o)), hh = ops.some(o => !isLCBot(o));
    let lo = ''; for (let i = ops.length - 1; i >= 0; i--) { if (!isLCBot(ops[i])) { lo = ops[i]; break; } }
    if (!lo && ops.length) lo = ops[ops.length - 1];
    const bn = hb ? (ops.find(o => isLCBot(o)) || '') : '';
    const tags: string[] = []; for (const t of tc) { const v = cl(row[t]); if (v) tags.push(v); }
    const gs = gr.split(',').map(g => g.trim()).filter(Boolean), last = gs[gs.length - 1] || '';
    let pr = '', ti = 'regular';
    if (last) {
      const p = last.split(' '); pr = p[0] || '';
      const rest = p.slice(1).join(' ').toLowerCase();
      if (rest.includes('vip support')) ti = 'vip';
      else if (rest.includes('privip')) ti = 'privip';
      else if (rest.includes('tg')) ti = 'tg';
      else ti = 'regular';
    }
    data.push({ confId: cid, date: ds, dateOnly: ds.substring(0, 10), visitorId: vid, lastOp: lo, tags, project: pr, tier: ti, hasBot: hb, hasHuman: hh, botName: bn });
  }
  return data;
}

const CW_META = new Set(['atom', 'motor', 'regular', 'vip', 'privip', 'tg', 'чат-бот', 'velora']);

function parseCW(rows: string[][], src: string): Chat[] {
  while (rows.length && rows[0].map(c => cl(c)).join('') === '') rows.shift();
  if (rows.length < 2) return [];
  const h = rows[0].map(c => cl(c));
  const iC = findCol(h, ['conversation ID', 'ID чата']), iD = findCol(h, ['Start date', 'Дата и время начала']), iI = findCol(h, ['Inbox', 'Источник']);
  const opCols = findOpCols(h);
  const catCols = findCols(h, ['Category ', 'Категория ']).filter(i => { const lo = h[i].toLowerCase(); return !lo.includes('score') && !lo.includes('оценка'); });
  const iAvatar = findCol(h, ['avatar_url_hash']), iTgId = findCol(h, ['social_telegram_user_id']), iUserId = findCol(h, ['user_id']);
  const data: Chat[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (row.length < 10) continue;
    const cid = cl(row[iC]); if (!cid) continue;
    const ds = cl(row[iD]), inbox = cl(row[iI]);
    let vid = '';
    if (iAvatar >= 0) { const v = cl(row[iAvatar]); if (v) vid = v; }
    if (!vid && iTgId >= 0) { const v = cl(row[iTgId]); if (v) vid = 'tg_' + v; }
    if (!vid && iUserId >= 0) { const v = cl(row[iUserId]); const m = v.match(/(\d{4,})/); if (m) vid = 'uid_' + m[1]; }
    const ops: string[] = []; for (const o of opCols) { const v = cl(row[o]); if (v) ops.push(v); }
    const hb = ops.length === 0, hh = ops.length > 0, lo = ops.length ? ops[ops.length - 1] : '';
    const tags: string[] = []; for (const c of catCols) { const v = cl(row[c]); if (v) tags.push(v); }
    let pr = '', ti = 'regular';
    const il = inbox.toLowerCase();
    if (il.endsWith(' tg')) { pr = inbox.split(' ')[0]; ti = 'tg'; }
    else if (il.endsWith(' support')) { pr = inbox.replace(/ Support$/i, '').trim(); ti = 'regular'; }
    else if (il.startsWith('support ')) { pr = inbox.replace(/^Support /i, '').trim(); ti = 'privip'; }
    else { pr = inbox; ti = 'vip'; }
    data.push({ confId: cid, date: ds, dateOnly: ds.substring(0, 10), visitorId: vid, lastOp: lo, tags, project: pr, tier: ti, hasBot: hb, hasHuman: hh, botName: '' });
  }
  return data;
}

function getRealTags(tags: string[], src: string): string[] {
  return tags.filter(t => {
    const lo = t.toLowerCase();
    if (lo.includes('продаж') || lo === 'spam' || lo.includes('spam')) return false;
    if (src === 'chatwoot' && CW_META.has(lo)) return false;
    return true;
  });
}

interface FcrEntry extends Chat { isFCR: boolean; fcrTag: string; }

function computeFCR(all: Chat[], filtered: Chat[], src: string): FcrEntry[] {
  const byV: Record<string, Chat[]> = {};
  for (const c of all) { const k = c.visitorId || ('_e_' + c.confId); (byV[k] = byV[k] || []).push(c); }
  const tid = new Set(filtered.map(c => c.confId));
  const res: FcrEntry[] = [];
  for (const chats of Object.values(byV)) {
    chats.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const tagChats: Record<string, Chat[]> = {};
    for (const c of chats) { for (const tag of getRealTags(c.tags, src)) { (tagChats[tag] = tagChats[tag] || []).push(c); } }
    for (const [tag, tc] of Object.entries(tagChats)) {
      for (let i = 0; i < tc.length; i++) {
        if (!tid.has(tc[i].confId)) continue;
        let fcr = true;
        if (tc[i + 1]) { if ((new Date(tc[i + 1].date).getTime() - new Date(tc[i].date).getTime()) / 3.6e6 <= 24) fcr = false; }
        res.push({ ...tc[i], isFCR: fcr, fcrTag: tag });
      }
    }
  }
  return res;
}

interface Agg { total: number; fcr: number; pct: string; pctNum: number; }
interface AggResult {
  total: number; fcrCount: number;
  byProject: Record<string, { total: number; fcr: number }>;
  byTier: Record<string, { total: number; fcr: number }>;
  byOp: Record<string, { total: number; fcr: number }>;
  byTag: Record<string, { total: number; fcr: number }>;
  byBot: Record<string, { total: number; fcr: number }>;
  byDate: Record<string, { total: number; fcr: number }>;
}

function agg(res: FcrEntry[]): AggResult {
  const t = res.length, f = res.filter(r => r.isFCR).length;
  const bP: AggResult['byProject'] = {}, bT: AggResult['byTier'] = {}, bO: AggResult['byOp'] = {};
  const bG: AggResult['byTag'] = {}, bB: AggResult['byBot'] = {}, bD: AggResult['byDate'] = {};
  const inc = (o: Record<string, { total: number; fcr: number }>, k: string, ok: boolean) => {
    if (!o[k]) o[k] = { total: 0, fcr: 0 }; o[k].total++; if (ok) o[k].fcr++;
  };
  for (const r of res) {
    inc(bP, r.project || '(нет)', r.isFCR); inc(bT, r.tier, r.isFCR);
    const op = r.lastOp || '(нет оператора)'; if (!isLCBot(op)) inc(bO, op, r.isFCR);
    inc(bG, r.fcrTag || '(без тега)', r.isFCR);
    if (r.botName) inc(bB, r.botName, r.isFCR);
    inc(bD, r.dateOnly, r.isFCR);
  }
  return { total: t, fcrCount: f, byProject: bP, byTier: bT, byOp: bO, byTag: bG, byBot: bB, byDate: bD };
}

function pct(a: number, b: number): string { return b === 0 ? '—' : ((a / b) * 100).toFixed(1) + '%'; }
function pn(a: number, b: number): number { return b === 0 ? 0 : (a / b) * 100; }
function bc(n: number): string { return n >= 85 ? '#00b894' : n >= 70 ? '#fdcb6e' : '#e17055'; }

function toRows(o: Record<string, { total: number; fcr: number }>): Array<{ name: string; total: number; fcr: number; pct: string; pctNum: number }> {
  return Object.entries(o).map(([k, v]) => ({ name: k, total: v.total, fcr: v.fcr, pct: pct(v.fcr, v.total), pctNum: pn(v.fcr, v.total) })).filter(r => r.total > 0);
}

type TabKey = 'overview' | 'projects' | 'tiers' | 'operators' | 'bots' | 'tags';

export default function TLFcrPage() {
  const [data, setData] = useState<Chat[] | null>(null);
  const [result, setResult] = useState<AggResult | null>(null);
  const [src, setSrc] = useState<'livechat' | 'chatwoot'>('livechat');
  const [fileName, setFileName] = useState('');
  const [tab, setTab] = useState<TabKey>('overview');
  const [filter, setFilter] = useState({ project: 'all', tier: 'all', bot: 'all', df: '', dt: '' });
  const [projects, setProjects] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [sortCol, setSortCol] = useState('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const recalc = useCallback((d: Chat[], s: typeof src, f: typeof filter) => {
    let ctx = d;
    if (f.project !== 'all') ctx = ctx.filter(x => x.project === f.project);
    if (f.tier !== 'all') ctx = ctx.filter(x => x.tier === f.tier);
    let t = ctx;
    if (f.bot === 'only_bot') t = t.filter(x => x.hasBot && !x.hasHuman);
    else if (f.bot === 'with_op') t = t.filter(x => x.hasHuman);
    if (f.df) t = t.filter(x => x.dateOnly >= f.df);
    if (f.dt) t = t.filter(x => x.dateOnly <= f.dt);
    setResult(agg(computeFCR(ctx, t, s)));
  }, []);

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let rows: string[][];
    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false, raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map((r: unknown) => (r as unknown[]).map(c => c == null ? '' : String(c)));
    } else {
      const text = await file.text();
      const head = text.substring(0, 3000);
      const delim = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',';
      rows = csvParse(text, delim);
    }
    while (rows.length && rows[0].map(c => cl(c)).join('') === '') rows.shift();
    if (!rows.length) return;
    const detectedSrc = detect(rows[0].map(c => cl(c)));
    setSrc(detectedSrc);
    const parsed = detectedSrc === 'chatwoot' ? parseCW(rows, detectedSrc) : parseLC(rows);
    setData(parsed);
    setFileName(`✓ ${file.name} — ${parsed.length} чатов`);
    const allProjects = [...new Set(parsed.map(c => c.project).filter(Boolean))].sort();
    const allTiers = [...new Set(parsed.map(c => c.tier))].sort();
    setProjects(allProjects);
    setTiers(allTiers);
    const dates = [...new Set(parsed.map(c => c.dateOnly))].sort();
    const newFilter = { project: 'all', tier: 'all', bot: 'all', df: dates.length >= 3 ? dates[1] : (dates[0] || ''), dt: dates.length >= 2 ? dates[dates.length - 2] : (dates[dates.length - 1] || '') };
    setFilter(newFilter);
    recalc(parsed, detectedSrc, newFilter);
  }

  useEffect(() => {
    if (!result || tab !== 'overview' || !canvasRef.current) return;
    const days = Object.entries(result.byDate).sort((x, y) => x[0].localeCompare(y[0]));
    if (days.length < 2) return;
    const labels = days.map(d => d[0].substring(5));
    const values = days.map(d => pn(d[1].fcr, d[1].total));
    drawChart(canvasRef.current, labels, values, '#a29bfe');
  }, [result, tab]);

  function drawChart(canvas: HTMLCanvasElement, labels: string[], values: number[], color: string) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement!.getBoundingClientRect().width - 40, H = 220;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr);
    const pad = { t: 20, r: 20, b: 50, l: 50 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    const mn = Math.max(Math.min(...values) - 5, 0), mx = Math.min(Math.max(...values) + 5, 100), range = mx - mn || 1;
    const toX = (i: number) => pad.l + (i / (labels.length - 1 || 1)) * cW;
    const toY = (v: number) => pad.t + cH - ((v - mn) / range * cH);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const v = mn + (range / 5) * i, y = toY(v);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillStyle = '#5a5970'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(0) + '%', pad.l - 8, y + 3);
    }
    ctx.fillStyle = '#5a5970'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center';
    const skip = Math.max(1, Math.floor(labels.length / 15));
    for (let i = 0; i < labels.length; i++) {
      if (i % skip !== 0 && i !== labels.length - 1) continue;
      ctx.save(); ctx.translate(toX(i), H - 8); ctx.rotate(-Math.PI / 4); ctx.fillText(labels[i], 0, 0); ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < values.length; i++) ctx.lineTo(toX(i), toY(values[i]));
    ctx.lineTo(toX(values.length - 1), toY(mn)); ctx.lineTo(toX(0), toY(mn)); ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    grad.addColorStop(0, color + '30'); grad.addColorStop(1, color + '05'); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < values.length; i++) ctx.lineTo(toX(i), toY(values[i]));
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    for (let i = 0; i < values.length; i++) {
      const x = toX(i), y = toY(values[i]);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fillStyle = '#161922'; ctx.fill();
    }
  }

  function sorted<T extends Record<string, unknown>>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'number') return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  function thClick(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const mono = "'JetBrains Mono', monospace";
  const tdS: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #2a2e3d', fontFamily: mono, fontSize: 13 };
  const thS: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', color: '#8b8a9e', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2a2e3d', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', fontFamily: mono };

  function TableView({ rows, nameLabel, extraCols }: { rows: ReturnType<typeof toRows>; nameLabel: string; extraCols?: Array<{ key: string; label: string }> }) {
    const cols = [{ key: 'name', label: nameLabel }, ...(extraCols || []), { key: 'total', label: 'Обращений' }, { key: 'fcr', label: 'FCR' }, { key: 'pctNum', label: 'FCR %' }];
    const s = sorted(rows as unknown as Record<string, unknown>[]) as typeof rows;
    return (
      <div style={{ overflowX: 'auto', border: '1px solid #2a2e3d', borderRadius: 10, background: '#161922' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: mono }}>
          <thead><tr>{cols.map(c => <th key={c.key} style={{ ...thS, textAlign: c.key !== 'name' ? 'right' : 'left', background: sortCol === c.key ? 'rgba(108,92,231,0.08)' : undefined }} onClick={() => thClick(c.key)}>{c.label}{sortCol === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</th>)}</tr></thead>
          <tbody>{s.map((r, i) => <tr key={i}>{cols.map(c => {
            let val: React.ReactNode = (r as Record<string, unknown>)[c.key] as string;
            if (c.key === 'pctNum') {
              const n = r.pctNum, col = bc(n);
              val = <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 80, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: Math.min(n, 100) + '%', background: col, borderRadius: 3 }} /></div>
                <span style={{ color: col, fontWeight: 600, minWidth: 50 }}>{r.pct}</span>
              </div>;
            } else if (c.key === 'total' || c.key === 'fcr') val = (r as Record<string, unknown>)[c.key] as number;
            return <td key={c.key} style={{ ...tdS, textAlign: c.key !== 'name' ? 'right' : 'left' }}>{val}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>
    );
  }

  const TABS: [TabKey, string][] = [['overview', 'Обзор'], ['projects', 'Проекты'], ['tiers', 'Тиры'], ['operators', 'Операторы'], ...(src === 'livechat' ? [['bots', 'Боты'] as [TabKey, string]] : []), ['tags', 'Теги']];

  return (
    <div style={{ background: '#0f1117', color: '#e8e6f0', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ background: 'linear-gradient(135deg,#1a1d27,#0f1117)', borderBottom: '1px solid #2a2e3d', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6c5ce7', boxShadow: '0 0 12px #6c5ce7' }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, letterSpacing: '-0.02em' }}>FCR Calculator</h1>
        </div>
        <p style={{ marginLeft: 20, fontSize: 13, color: '#8b8a9e' }}>First Contact Resolution — анализ обращений · порог 24 часа</p>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Upload */}
        <div style={{ background: '#1a1d27', border: '1px solid #2a2e3d', borderRadius: 12, padding: 20, marginBottom: 24, maxWidth: 600 }}>
          <div style={{ fontSize: 12, color: '#8b8a9e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontFamily: mono }}>
            Выгрузка чатов {data && <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontFamily: mono, fontWeight: 600, marginLeft: 8, background: src === 'chatwoot' ? 'rgba(108,92,231,0.15)' : 'rgba(0,184,148,0.15)', color: src === 'chatwoot' ? '#a29bfe' : '#00b894' }}>{src === 'chatwoot' ? 'Chatwoot' : 'LiveChat'}</span>}
          </div>
          <label style={{ display: 'block', padding: 16, border: `2px dashed ${data ? '#00b894' : '#2a2e3d'}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer', background: data ? 'rgba(0,184,148,0.05)' : undefined }}>
            <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <div style={{ fontSize: 13, color: data ? '#00b894' : '#8b8a9e' }}>{fileName || 'CSV или XLSX · LiveChat или Chatwoot'}</div>
          </label>
        </div>

        {result && data && (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#8b8a9e', fontFamily: mono }}>
                с <input type="date" value={filter.df} onChange={e => { const f = { ...filter, df: e.target.value }; setFilter(f); recalc(data, src, f); }} style={{ background: '#1a1d27', border: '1px solid #2a2e3d', color: '#e8e6f0', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: mono, colorScheme: 'dark' }} />
                по <input type="date" value={filter.dt} onChange={e => { const f = { ...filter, dt: e.target.value }; setFilter(f); recalc(data, src, f); }} style={{ background: '#1a1d27', border: '1px solid #2a2e3d', color: '#e8e6f0', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: mono, colorScheme: 'dark' }} />
              </div>
              {[['project', 'Все проекты', projects.map(p => [p, p] as [string, string])], ['tier', 'Все тиры', tiers.map(t => [t, TL_LABELS[t] || t] as [string, string])], ['bot', 'Все чаты', [['only_bot', 'Только бот'], ['with_op', 'С оператором']] as [string, string][]]].map(([key, def, opts]) => (
                <select key={key as string} value={(filter as Record<string, string>)[key as string]} onChange={e => { const f = { ...filter, [key as string]: e.target.value }; setFilter(f); recalc(data, src, f); }} style={{ background: '#1a1d27', border: '1px solid #2a2e3d', color: '#e8e6f0', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: mono, cursor: 'pointer' }}>
                  <option value="all">{def as string}</option>
                  {(opts as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ))}
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
              {[['Всего обращений', result.total.toLocaleString(), '#e8e6f0'], ['FCR', result.fcrCount.toLocaleString(), '#00b894'], ['Не FCR', (result.total - result.fcrCount).toLocaleString(), '#e17055'], ['FCR %', pct(result.fcrCount, result.total), '#a29bfe']].map(([label, value, color]) => (
                <div key={label} style={{ background: '#161922', border: '1px solid #2a2e3d', borderRadius: 12, padding: '20px 24px', minWidth: 160, flex: '1 1 160px' }}>
                  <div style={{ fontSize: 12, color: '#8b8a9e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, fontFamily: mono }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: mono, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
              {TABS.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 18px', border: `1px solid ${tab === k ? '#6c5ce7' : '#2a2e3d'}`, background: tab === k ? 'rgba(108,92,231,0.15)' : 'transparent', color: tab === k ? '#a29bfe' : '#8b8a9e', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 600 : 400, fontFamily: mono }}>{l}</button>
              ))}
            </div>

            {/* Content */}
            {tab === 'overview' && (
              <>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 13, color: '#8b8a9e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontFamily: mono }}>FCR % по дням</div>
                  <div style={{ background: '#161922', border: '1px solid #2a2e3d', borderRadius: 10, padding: 20, position: 'relative' }}>
                    <canvas ref={canvasRef} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[['byTag', 'Топ-10 категорий · наименьший FCR'], ['byOp', 'Топ-10 операторов · наименьший FCR']].map(([k, title]) => {
                    const rows = toRows((result as unknown as Record<string, Record<string, { total: number; fcr: number }>>)[k]).filter(r => r.name !== '(нет оператора)').sort((a, b) => a.pctNum - b.pctNum).slice(0, 10);
                    if (!rows.length) return null;
                    return (
                      <div key={k} style={{ flex: '1 1 300px' }}>
                        <div style={{ fontSize: 13, color: '#8b8a9e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontFamily: mono }}>{title}</div>
                        <div style={{ overflowX: 'auto', border: '1px solid #2a2e3d', borderRadius: 10, background: '#161922' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr><th style={thS}>Название</th><th style={{ ...thS, textAlign: 'right' }}>Обращений</th><th style={{ ...thS, textAlign: 'right' }}>FCR %</th></tr></thead>
                            <tbody>{rows.map((r, i) => <tr key={i}><td style={{ ...tdS, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</td><td style={{ ...tdS, textAlign: 'right' }}>{r.total}</td><td style={{ ...tdS, textAlign: 'right', color: bc(r.pctNum), fontWeight: 600 }}>{r.pct}</td></tr>)}</tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {tab === 'projects' && <TableView rows={toRows(result.byProject)} nameLabel="Проект" />}
            {tab === 'tiers' && <TableView rows={toRows(result.byTier).map(r => ({ ...r, name: TL_LABELS[r.name] || r.name }))} nameLabel="Тир" />}
            {tab === 'operators' && <TableView rows={toRows(result.byOp)} nameLabel="Оператор" />}
            {tab === 'bots' && src === 'livechat' && <TableView rows={toRows(result.byBot).map(r => { const b = botBase(r.name); return { ...r, botType: isPrvBot(r.name) ? 'PreVIP' : 'Regular' }; })} nameLabel="Бот" extraCols={[{ key: 'botType', label: 'Тип' }]} />}
            {tab === 'tags' && <TableView rows={toRows(result.byTag)} nameLabel="Тег" />}
          </>
        )}
      </div>
    </div>
  );
}
