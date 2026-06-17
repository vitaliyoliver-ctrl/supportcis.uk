import React, { useState, useRef, useCallback } from 'react';

// Отчёт по смене — порт tl/daily-report/index.html
// Загрузка XLSX → построение таблиц по дням + аналитика + текст + фото (html2canvas)

type Mode = 'day' | 'night' | 'both' | 'custom';
interface DayCfg {
  id: number;
  dateFrom: string;
  dateTo: string;
  mode: Mode;
  timeFrom: string; // HH:MM (для custom/both)
  timeTo: string;
  label: string;
  comment: string;
}
interface DayResult {
  projectMap: Record<string, Record<string, number>>;
  provMap: Record<string, number>;
  catOrder: string[];
}

const BAR_COLORS = ['#7c6af7', '#f7a26a', '#5af78e', '#6ab8f7', '#f75a5a', '#f7d56a'];

function today(): string {
  const t = new Date(), p = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
function escHtml(s: unknown) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function normDate(s: unknown): string {
  let str = String(s ?? '').trim(); if (!str) return '';
  const m1 = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m1) return m1[3] + '-' + (m1[2].length < 2 ? '0' : '') + m1[2] + '-' + (m1[1].length < 2 ? '0' : '') + m1[1];
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m2) return m2[0];
  if (/^\d+$/.test(str)) { const sn = parseInt(str); if (sn > 40000 && sn < 60000) { const d = new Date((sn - 25569) * 86400000), p = (n: number) => (n < 10 ? '0' + n : '' + n); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); } }
  return str.slice(0, 10);
}
function timeToMins(t: unknown): number {
  if (!t && t !== 0) return -1; const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/); if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  const f = parseFloat(s); if (!isNaN(f) && f >= 0 && f < 1) return Math.round(f * 24 * 60);
  return -1;
}
function fmtDate(iso: string) { const d = iso.split('-'); return d[2] + '.' + d[1] + '.' + d[0]; }
function dateToDays(iso: string) { const d = iso.split('-'); return parseInt(d[0]) * 365 + parseInt(d[1]) * 31 + parseInt(d[2]); }
function dtToNum(iso: string, mins: number) { return dateToDays(iso) * 1440 + mins; }
function isProvCat(cat: string) { const l = cat.toLowerCase(); return l.includes('провайдер') || l.includes('provider'); }

type Cols = { time: number; date: number; project: number; category: number; prov: number[] };
function detectCols(header: unknown[]): Cols {
  const c: Cols = { time: -1, date: -1, project: -1, category: -1, prov: [] };
  header.forEach((h, i) => {
    const lh = String(h).toLowerCase().trim();
    if (c.time < 0 && (lh.includes('врем') || lh === 'time')) c.time = i;
    else if (c.date < 0 && (lh.includes('дат') || lh === 'date')) c.date = i;
    else if (c.project < 0 && (lh.includes('проект') || lh.includes('бренд') || lh.includes('brand'))) c.project = i;
    else if (c.category < 0 && (lh.includes('трудност') || lh.includes('категор') || lh.includes('тип'))) c.category = i;
    else if ((lh.includes('провайдер') || lh.includes('provider') || lh.startsWith('prov')) && !lh.includes('интернет') && !lh.includes('internet')) c.prov.push(i);
  });
  if (c.time < 0) c.time = 1; if (c.date < 0) c.date = 2; if (c.project < 0) c.project = 3; if (c.category < 0) c.category = 5;
  if (c.prov.length === 0) c.prov = [14, 15, 16];
  return c;
}

function processDay(rows: unknown[][], cols: Cols, cfg: { dateFrom: string; dateTo: string; timeFrom: number; timeTo: number; crossMidnight: boolean; useDatetime: boolean }): DayResult {
  const projectMap: Record<string, Record<string, number>> = {};
  const provMap: Record<string, number> = {};
  const catOrder: string[] = [], catSet: Record<string, number> = {};
  const fromDt = dtToNum(cfg.dateFrom, cfg.timeFrom), toDt = dtToNum(cfg.dateTo, cfg.timeTo);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;
    const rd = normDate(row[cols.date]), mins = timeToMins(row[cols.time]);
    if (!rd || mins < 0) continue;
    let inShift: boolean;
    if (cfg.useDatetime) { const rowDt = dtToNum(rd, mins); inShift = rowDt >= fromDt && rowDt < toDt; }
    else if (cfg.crossMidnight) { if (rd < cfg.dateFrom || rd > cfg.dateTo) continue; inShift = mins >= cfg.timeFrom || mins < cfg.timeTo; }
    else { if (rd < cfg.dateFrom || rd > cfg.dateTo) continue; inShift = mins >= cfg.timeFrom && mins < cfg.timeTo; }
    if (!inShift) continue;
    const cat = String(row[cols.category] || '').trim(), proj = String(row[cols.project] || '').trim().toUpperCase();
    if (!cat || !proj) continue;
    if (!catSet[cat]) { catSet[cat] = 1; catOrder.push(cat); }
    if (!projectMap[proj]) projectMap[proj] = {};
    projectMap[proj][cat] = (projectMap[proj][cat] || 0) + 1;
    cols.prov.forEach(pc => { const pv = row[pc] ? String(row[pc]).trim() : ''; if (pv && pv !== '0' && pv !== '-' && pv.length > 1) provMap[pv] = (provMap[pv] || 0) + 1; });
  }
  return { projectMap, provMap, catOrder };
}

function buildChain(vals: number[], showVals: boolean): string {
  let html = '<div class="an-chain">';
  vals.forEach((v, i) => {
    if (showVals) html += '<div class="an-step-val">' + v + '</div>';
    if (i < vals.length - 1) {
      const curr = v, next = vals[i + 1], diff = next - curr;
      const pct = curr > 0 ? Math.round((diff / curr) * 100) : next > 0 ? 100 : 0;
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
      const pctTxt = diff > 0 ? '+' + pct + '%' : diff < 0 ? pct + '%' : '0%';
      html += '<div class="an-step-arr ' + cls + '"><div class="an-step-arrow">' + arrow + '</div><div class="an-step-pct">' + pctTxt + '</div></div>';
    }
  });
  if (vals.length >= 2) {
    const first = vals[0], last = vals[vals.length - 1], diff = last - first;
    const pct = first > 0 ? Math.round((diff / first) * 100) : last > 0 ? 100 : 0;
    const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    html += '<span class="an-final ' + cls + '">Итог: ' + arrow + (diff !== 0 ? (diff > 0 ? '+' : '') + pct + '%' : '±0') + '</span>';
  }
  return html + '</div>';
}

function buildTableBlock(dayNum: string, dateLabel: string, shiftLabel: string, comment: string, result: DayResult): string {
  const pm = result.projectMap, prov = result.provMap, cats = result.catOrder;
  const projects = Object.keys(pm).sort();
  if (!projects.length && !Object.keys(prov).length) return '<div class="rday-block"><div class="rday-header"><div class="rday-datebox">' + dayNum + '</div><span class="rday-title">' + dateLabel + ' — нет данных</span></div></div>';
  let html = '<div class="rday-block"><div class="rday-header"><div class="rday-datebox">' + dayNum + '</div><span class="rday-title">' + dateLabel + ' (' + shiftLabel + ')</span></div>';
  if (comment) html += '<div class="rday-comment">' + escHtml(comment) + '</div>';
  html += '<table class="rtable" style="width:100%;table-layout:fixed"><thead><tr><th style="width:90px">Проект</th>';
  cats.forEach(c => { html += '<th>' + escHtml(c) + '</th>'; });
  html += '<th style="width:60px">Всего</th></tr></thead><tbody>';
  const totals: Record<string, number> = {}; cats.forEach(c => { totals[c] = 0; });
  let grand = 0;
  projects.forEach(p => {
    const v = pm[p]; let rowTotal = 0; cats.forEach(c => { rowTotal += v[c] || 0; });
    grand += rowTotal;
    html += '<tr><td>' + escHtml(p) + '</td>';
    cats.forEach(c => { const n = v[c] || 0; totals[c] += n; html += '<td class="' + (n ? 'nz' : 'zero') + '">' + n + '</td>'; });
    html += '<td class="' + (rowTotal ? 'nz' : 'zero') + '">' + rowTotal + '</td></tr>';
  });
  html += '</tbody><tfoot><tr class="total"><td>Всего</td>';
  cats.forEach(c => { html += '<td>' + totals[c] + '</td>'; });
  html += '<td>' + grand + '</td></tr></tfoot></table></div>';
  const provList = Object.entries(prov).sort((a, b) => b[1] - a[1]);
  if (provList.length) {
    html += '<div class="rprov"><strong>Провайдеры:</strong> ';
    html += provList.map(e => escHtml(e[0]) + ' — ' + e[1]).join(' &nbsp;·&nbsp; ');
  }
  return html + '</div>';
}

function buildTextBlock(dateLabel: string, shiftLabel: string, comment: string, result: DayResult): string {
  const pm = result.projectMap, prov = result.provMap, cats = result.catOrder;
  const lines = ['📊 Отчёт по смене', '📅 ' + dateLabel, '🕒 ' + shiftLabel];
  if (comment) lines.push('💬 ' + comment);
  lines.push('');
  cats.forEach(cat => {
    const entries: { proj: string; n: number }[] = [];
    Object.keys(pm).forEach(proj => { const n = pm[proj][cat] || 0; if (n > 0) entries.push({ proj, n }); });
    entries.sort((a, b) => b.n - a.n);
    if (!entries.length || isProvCat(cat)) return;
    lines.push(cat + ':');
    entries.forEach(e => lines.push(e.proj + ' — ' + e.n));
    lines.push('');
  });
  const provList = Object.entries(prov).sort((a, b) => b[1] - a[1]);
  if (provList.length) {
    lines.push('Трудности с провайдерами:');
    provList.forEach(e => lines.push(e[0] + ' — ' + e[1]));
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildProvAnalytics(results: DayResult[], labels: string[]): string {
  const allProvs: Record<string, number> = {};
  results.forEach(r => { Object.keys(r.provMap).forEach(p => { allProvs[p] = 1; }); });
  let provList = Object.keys(allProvs);
  if (!provList.length) return '';
  const provData: Record<string, number[]> = {};
  provList.forEach(p => { provData[p] = results.map(r => r.provMap[p] || 0); });
  provList.sort((a, b) => provData[b].reduce((s, v) => s + v, 0) - provData[a].reduce((s, v) => s + v, 0));
  let maxV = 1;
  provList.forEach(p => provData[p].forEach(v => { if (v > maxV) maxV = v; }));
  const dayProvTotals = results.map(r => Object.values(r.provMap).reduce((s, v) => s + v, 0));
  const grand = dayProvTotals.reduce((s, v) => s + v, 0);
  if (!grand) return '';
  let html = '<div class="analytics-card"><div class="an-title">⚙️ Аналитика по провайдерам</div><div class="an-sub">Динамика обращений · ' + labels.join(' → ') + '</div>';
  html += '<div class="an-total-row">';
  labels.forEach((lbl, i) => { html += '<div class="an-total-chip"><div class="tc-day">' + dayProvTotals[i] + '</div><div class="tc-lbl">' + lbl + '</div></div>'; });
  html += '</div>';
  if (results.length >= 2) html += '<div style="margin-top:10px;padding:8px 12px;background:#1e1e28;border-radius:8px;display:inline-flex;align-items:center;gap:8px;"><span style="font-size:11px;color:#6b6880;font-weight:700;">ОБЩИЙ ТРЕНД</span>' + buildChain(dayProvTotals, true) + '</div>';
  html += '<div style="margin-top:18px">';
  provList.forEach(prov => {
    const vals = provData[prov], total = vals.reduce((s, v) => s + v, 0);
    if (!total) return;
    const share = grand > 0 ? Math.round((total / grand) * 100) : 0;
    html += '<div class="an-row"><span class="an-cat">' + escHtml(prov) + '</span><div class="an-col-bars">';
    vals.forEach((v, i) => { const barH = Math.max(Math.round((v / maxV) * 28), v > 0 ? 3 : 1); html += '<div class="an-bar-wrap"><div class="an-bar" style="height:' + barH + 'px;background:' + BAR_COLORS[i % BAR_COLORS.length] + '"></div><div class="an-bar-lbl">' + v + '</div></div>'; });
    html += '</div><div class="an-col-total">' + total + '</div><div class="an-col-share"><span style="font-size:12px;color:#6b6880">' + share + '%</span><div style="height:3px;background:#2a2a38;border-radius:2px;margin-top:3px;"><div style="height:100%;width:' + share + '%;background:#7c6af7;border-radius:2px;"></div></div></div>';
    html += buildChain(vals, false).replace('class="an-chain"', 'class="an-col-chain"');
    html += '</div>';
  });
  return html + '</div></div>';
}

function buildAnalytics(results: DayResult[], labels: string[]): string {
  const allCatSet: Record<string, number> = {}, allCats: string[] = [];
  results.forEach(r => r.catOrder.forEach(c => { if (!isProvCat(c) && !allCatSet[c]) { allCatSet[c] = 1; allCats.push(c); } }));
  const catTotals: Record<string, number[]> = {};
  allCats.forEach(cat => { catTotals[cat] = results.map(r => { let t = 0; Object.keys(r.projectMap).forEach(p => { t += r.projectMap[p][cat] || 0; }); return t; }); });
  const dayTotals = results.map(r => { let t = 0; Object.keys(r.projectMap).forEach(p => Object.keys(r.projectMap[p]).forEach(c => { t += r.projectMap[p][c]; })); return t; });
  let maxBarVal = 1;
  allCats.forEach(cat => catTotals[cat].forEach(v => { if (v > maxBarVal) maxBarVal = v; }));
  let html = '<div class="analytics-card"><div class="an-title">📈 Сравнительная аналитика</div><div class="an-sub">Динамика обращений по тематикам · ' + labels.join(' → ') + '</div>';
  html += '<div class="an-total-row">';
  labels.forEach((lbl, i) => { html += '<div class="an-total-chip"><div class="tc-day">' + dayTotals[i] + '</div><div class="tc-lbl">' + lbl + '</div></div>'; });
  html += '</div>';
  if (results.length >= 2) html += '<div style="margin-top:10px;padding:8px 12px;background:#1e1e28;border-radius:8px;display:inline-flex;align-items:center;gap:8px;"><span style="font-size:11px;color:#6b6880;font-weight:700;">ОБЩИЙ ТРЕНД</span>' + buildChain(dayTotals, true) + '</div>';
  html += '<div style="margin-top:18px">';
  allCats.sort((a, b) => catTotals[b].reduce((s, v) => s + v, 0) - catTotals[a].reduce((s, v) => s + v, 0));
  allCats.forEach(cat => {
    const vals = catTotals[cat], total = vals.reduce((s, v) => s + v, 0);
    if (total === 0) return;
    html += '<div class="an-row" style="grid-template-columns:200px 120px 1fr"><span class="an-cat">' + escHtml(cat) + '</span><div class="an-col-bars">';
    vals.forEach((v, i) => { const barH = Math.max(Math.round((v / maxBarVal) * 28), v > 0 ? 3 : 1); html += '<div class="an-bar-wrap"><div class="an-bar" style="height:' + barH + 'px;background:' + BAR_COLORS[i % BAR_COLORS.length] + '"></div><div class="an-bar-lbl">' + v + '</div></div>'; });
    html += '</div>' + buildChain(vals, false) + '</div>';
  });
  return html + '</div></div></div>';
}

const ANALYTICS_CSS = `
.analytics-card{background:#16161d;border:1px solid #2a2a38;border-radius:14px;padding:22px 26px;}
.an-title{font-size:14px;font-weight:800;color:#e8e6f0;margin-bottom:4px;display:flex;align-items:center;gap:8px;}
.an-sub{font-size:12px;color:#6b6880;margin-bottom:20px;}
.an-row{display:grid;grid-template-columns:200px 120px 70px 70px 1fr;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #2a2a38;}
.an-row:last-child{border-bottom:none;}
.an-cat{font-size:13px;font-weight:600;color:#e8e6f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.an-col-bars{display:flex;gap:5px;align-items:flex-end;height:32px;}
.an-col-total{font-size:15px;font-weight:800;color:#7c6af7;text-align:right;}
.an-col-share{text-align:right;}
.an-col-chain{display:flex;align-items:center;gap:4px;flex-wrap:nowrap;}
.an-bar-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;}
.an-bar{width:18px;border-radius:3px 3px 0 0;min-height:2px;}
.an-bar-lbl{font-size:9px;color:#6b6880;font-family:monospace;white-space:nowrap;}
.an-chain{display:flex;align-items:center;gap:4px;flex-wrap:nowrap;}
.an-step-val{font-size:12px;font-weight:700;color:#e8e6f0;min-width:16px;text-align:center;}
.an-step-arr{display:flex;flex-direction:column;align-items:center;}
.an-step-arrow{font-size:11px;font-weight:700;line-height:1;}
.an-step-pct{font-size:9px;font-family:monospace;line-height:1;}
.an-step-arr.up .an-step-arrow,.an-step-arr.up .an-step-pct{color:#f75a5a;}
.an-step-arr.down .an-step-arrow,.an-step-arr.down .an-step-pct{color:#5af78e;}
.an-step-arr.flat .an-step-arrow,.an-step-arr.flat .an-step-pct{color:#6b6880;}
.an-final{font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;margin-left:4px;white-space:nowrap;}
.an-final.up{background:rgba(247,90,90,.15);color:#f75a5a;}
.an-final.down{background:rgba(90,247,142,.15);color:#5af78e;}
.an-final.flat{background:#1e1e28;color:#6b6880;}
.an-total-row{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;}
.an-total-chip{background:#1e1e28;border:1px solid #2a2a38;border-radius:8px;padding:8px 14px;font-size:12px;}
.an-total-chip .tc-day{font-weight:700;color:#7c6af7;font-size:15px;}
.an-total-chip .tc-lbl{color:#6b6880;font-size:11px;}
#reportScreenshot{background:#fff;border-radius:14px;padding:28px 32px;margin-bottom:18px;width:100%;}
.rday-block{margin-bottom:32px;}.rday-block:last-child{margin-bottom:0;}
.rday-header{display:flex;align-items:center;gap:10px;margin-bottom:4px;padding-bottom:8px;border-bottom:2px solid #e0e0e0;}
.rday-datebox{width:26px;height:26px;background:#1a73e8;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;flex-shrink:0;}
.rday-title{font-size:15px;font-weight:700;color:#1a1a1a;}
.rday-comment{font-size:12px;color:#666;margin-bottom:10px;padding:6px 10px;background:#f9f9fb;border-left:3px solid #1a73e8;border-radius:0 4px 4px 0;font-style:italic;white-space:pre-wrap;}
.rtable{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#222;margin-bottom:8px;}
.rtable th{background:#f8f8f8;font-weight:600;font-size:12px;padding:7px 10px;text-align:center;border-bottom:2px solid #ddd;color:#444;word-break:break-word;min-width:80px;line-height:1.35;}
.rtable th:first-child{text-align:left;}
.rtable td{padding:6px 10px;border-bottom:1px solid #eee;text-align:center;}
.rtable td:first-child{text-align:left;font-weight:500;}
.rtable tr.total td{font-weight:700;background:#f0f4ff;border-top:2px solid #c5cfe8;}
.zero{color:#bbb;}.nz{color:#1a1a1a;font-weight:500;}
.rprov{font-size:12px;color:#444;padding:7px 12px;background:#f9f9f9;border-left:3px solid #1a73e8;border-radius:0 4px 4px 0;margin-top:6px;}
.rprov strong{color:#1a73e8;}
`;

const SHIFT_LABELS: Record<Mode, string> = {
  day: 'Дневная смена (9:00 – 21:00)',
  night: 'Ночная смена (21:00 – 9:00)',
  both: 'Дневная + Ночная смена (24ч)',
  custom: '',
};

export default function TLDailyReport() {
  const [parsedRows, setParsedRows] = useState<unknown[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [days, setDays] = useState<DayCfg[]>([{ id: 0, dateFrom: today(), dateTo: today(), mode: 'day', timeFrom: '09:00', timeTo: '21:00', label: SHIFT_LABELS.day, comment: '' }]);
  const [status, setStatus] = useState<{ msg: string; type: '' | 'ok' | 'err' } | null>(null);
  const [reportHtml, setReportHtml] = useState('');
  const [textOut, setTextOut] = useState('');
  const [analyticsHtml, setAnalyticsHtml] = useState('');
  const [provHtml, setProvHtml] = useState('');
  const nextId = useRef(1);

  const setSt = (msg: string, type: '' | 'ok' | 'err') => setStatus({ msg, type });

  async function loadFile(file: File) {
    setSt('⏳ Загружаю...', '');
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as unknown[][];
      setParsedRows(rows);
      setFileName(file.name);
      setSt('✓ Файл загружен · настройте дни и нажмите «Сформировать»', 'ok');
    } catch (e) {
      setSt('✗ Ошибка: ' + (e as Error).message, 'err');
    }
  }

  function addDay() {
    setDays(d => [...d, { id: nextId.current++, dateFrom: today(), dateTo: today(), mode: 'day', timeFrom: '09:00', timeTo: '21:00', label: SHIFT_LABELS.day, comment: '' }]);
  }
  function delDay(id: number) { setDays(d => d.filter(x => x.id !== id)); }
  function updateDay(id: number, patch: Partial<DayCfg>) { setDays(d => d.map(x => x.id === id ? { ...x, ...patch } : x)); }
  function setMode(id: number, m: Mode) {
    setDays(d => d.map(x => {
      if (x.id !== id) return x;
      const patch: Partial<DayCfg> = { mode: m, label: SHIFT_LABELS[m] || x.label };
      if (m === 'both') { patch.timeFrom = '09:00'; patch.timeTo = '09:00'; }
      return { ...x, ...patch };
    }));
  }

  const generate = useCallback(() => {
    if (!parsedRows) { setSt('⚠ Сначала загрузите файл', 'err'); return; }
    if (!days.length) { setSt('⚠ Добавьте хотя бы один день', 'err'); return; }
    const cols = detectCols(parsedRows[0]);
    let rHtml = '', textAll = '';
    const allResults: DayResult[] = [], allLabels: string[] = [];
    for (const day of days) {
      let tFrom: number, tTo: number, cross = false, useDt = false;
      if (day.mode === 'day') { tFrom = 9 * 60; tTo = 21 * 60; }
      else if (day.mode === 'night') { tFrom = 21 * 60; tTo = 9 * 60; cross = true; }
      else if (day.mode === 'both') { tFrom = timeToMins(day.timeFrom || '09:00'); tTo = timeToMins(day.timeTo || '09:00'); useDt = true; }
      else { tFrom = timeToMins(day.timeFrom || '00:00'); tTo = timeToMins(day.timeTo || '23:59'); if (day.dateFrom !== day.dateTo && tTo <= tFrom) useDt = true; else cross = tTo <= tFrom; }
      const result = processDay(parsedRows, cols, { dateFrom: day.dateFrom, dateTo: day.dateTo, timeFrom: tFrom, timeTo: tTo, crossMidnight: cross, useDatetime: useDt });
      const dateLabel = day.dateFrom === day.dateTo ? fmtDate(day.dateFrom) : fmtDate(day.dateFrom) + ' – ' + fmtDate(day.dateTo);
      const dayNum = day.dateFrom.split('-')[2];
      rHtml += buildTableBlock(dayNum, dateLabel, day.label || 'Смена', day.comment, result);
      textAll += buildTextBlock(dateLabel, day.label || 'Смена', day.comment, result) + '\n\n---\n\n';
      allResults.push(result);
      allLabels.push(dateLabel);
    }
    setReportHtml(rHtml);
    setTextOut(textAll.replace(/\n\n---\n\n$/, '').trim());
    setProvHtml(buildProvAnalytics(allResults, allLabels));
    setAnalyticsHtml(allResults.length >= 2 ? buildAnalytics(allResults, allLabels) : '');
    setSt('✓ Отчёт сформирован · ' + days.length + ' дн.', 'ok');
  }, [parsedRows, days]);

  async function copyText() {
    try { await navigator.clipboard.writeText(textOut); setSt('✓ Скопировано', 'ok'); } catch { setSt('✗ Не удалось скопировать', 'err'); }
  }

  async function takePhoto(elId: string, suffix: string) {
    const el = document.getElementById(elId);
    if (!el) return;
    setSt('⏳ Готовлю фото...', '');
    try {
      // @ts-expect-error html2canvas без типов, грузим из CDN при первом вызове
      let h2c = window.html2canvas;
      if (!h2c) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload = () => resolve(); s.onerror = () => reject(new Error('load fail'));
          document.head.appendChild(s);
        });
        // @ts-expect-error global
        h2c = window.html2canvas;
      }
      const canvas = await h2c(el, { backgroundColor: '#1e1e28', scale: 2, useCORS: true, logging: false });
      const a = document.createElement('a');
      a.download = 'report_' + suffix + '_' + today() + '.png';
      a.href = canvas.toDataURL('image/png'); a.click();
      setSt('✓ Фото сохранено', 'ok');
    } catch (e) { setSt('✗ ' + (e as Error).message, 'err'); }
  }

  const C = { bg: '#0f0f13', surface: '#16161d', surface2: '#1e1e28', border: '#2a2a38', accent: '#7c6af7', text: '#e8e6f0', muted: '#6b6880', green: '#5af78e', red: '#f75a5a' };
  const cardLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 14 };
  const inp: React.CSSProperties = { background: C.bg, border: `1.5px solid ${C.border}`, color: C.text, padding: '7px 10px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' };
  const fieldLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: "'Manrope', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{ANALYTICS_CSS}</style>

      <div style={{ padding: '18px 36px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, background: C.accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📊</div>
        <div><h1 style={{ fontSize: 16, fontWeight: 800 }}>Отчёт по смене</h1><span style={{ fontSize: 11, color: C.muted }}>Технические трудности · CG</span></div>
      </div>

      <div style={{ padding: '24px 36px', maxWidth: 1020 }}>
        {/* Upload */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 26px', marginBottom: 20 }}>
          <div style={cardLabel}>1. Загрузите файл Excel</div>
          <label
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); }}
            style={{ display: 'block', border: `2px ${fileName ? 'solid' : 'dashed'} ${fileName ? C.green : C.border}`, borderRadius: 10, padding: '24px 20px', textAlign: 'center', cursor: 'pointer', background: fileName ? 'rgba(90,247,142,.04)' : undefined }}
          >
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) loadFile(e.target.files[0]); }} />
            <div style={{ fontSize: 24, marginBottom: 6 }}>{fileName ? '✅' : '📂'}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, color: fileName ? C.green : C.text }}>{fileName || 'Загрузите файл из SharePoint / OneDrive'}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{parsedRows ? (parsedRows.length - 1) + ' строк · нажмите для замены' : 'Скачайте и перетащите сюда или нажмите · .xlsx'}</div>
          </label>
        </div>

        {/* Days */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 26px', marginBottom: 20 }}>
          <div style={cardLabel}>2. Настройте дни и смены</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            {days.map(day => (
              <div key={day.id} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label style={fieldLabel}>Дата с</label><input type="date" value={day.dateFrom} onChange={e => updateDay(day.id, { dateFrom: e.target.value })} style={{ ...inp, colorScheme: 'dark' }} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label style={fieldLabel}>Дата по</label><input type="date" value={day.dateTo} onChange={e => updateDay(day.id, { dateTo: e.target.value })} style={{ ...inp, colorScheme: 'dark' }} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={fieldLabel}>Смена</label>
                    <div style={{ display: 'flex', border: `1.5px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                      {([['day', '☀️ День'], ['night', '🌙 Ночь'], ['both', '🌗 Сутки'], ['custom', '⚙️']] as [Mode, string][]).map(([m, lbl]) => (
                        <button key={m} onClick={() => setMode(day.id, m)} style={{ padding: '7px 11px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: day.mode === m ? C.accent : 'transparent', color: day.mode === m ? '#fff' : C.muted, whiteSpace: 'nowrap' }}>{lbl}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}><label style={fieldLabel}>Подпись смены</label><input type="text" value={day.label} onChange={e => updateDay(day.id, { label: e.target.value })} placeholder="Дневная смена" style={{ ...inp, width: '100%' }} /></div>
                  <button onClick={() => delDay(day.id)} style={{ background: 'transparent', border: '1px solid #f75a5a44', color: C.red, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>✕ Удалить</button>
                </div>
                {(day.mode === 'custom' || day.mode === 'both') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label style={fieldLabel}>С</label><input type="time" value={day.timeFrom} onChange={e => updateDay(day.id, { timeFrom: e.target.value })} style={{ ...inp, colorScheme: 'dark' }} /></div>
                    <span style={{ color: C.muted, fontSize: 14, alignSelf: 'flex-end', paddingBottom: 7 }}>→</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label style={fieldLabel}>По</label><input type="time" value={day.timeTo} onChange={e => updateDay(day.id, { timeTo: e.target.value })} style={{ ...inp, colorScheme: 'dark' }} /></div>
                  </div>
                )}
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={fieldLabel}>Комментарий (необязательно)</label>
                  <textarea value={day.comment} onChange={e => updateDay(day.id, { comment: e.target.value })} placeholder="Добавьте заметку к смене..." style={{ ...inp, width: '100%', resize: 'vertical', minHeight: 48 }} />
                </div>
              </div>
            ))}
          </div>
          <button onClick={addDay} style={{ width: '100%', padding: 10, border: `2px dashed ${C.border}`, borderRadius: 10, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.muted, fontFamily: 'inherit' }}>+ Добавить день</button>
          <button onClick={generate} style={{ background: C.accent, border: 'none', color: '#fff', padding: '11px 28px', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'block', width: '100%', marginTop: 14 }}>📊 Сформировать отчёт</button>
        </div>

        {status && <div style={{ background: C.surface2, border: `1px solid ${status.type === 'err' ? C.red : status.type === 'ok' ? C.green : C.border}`, borderRadius: 10, padding: '10px 15px', marginBottom: 16, fontSize: 12, color: status.type === 'err' ? C.red : status.type === 'ok' ? C.green : C.muted }}>{status.msg}</div>}

        {reportHtml && (
          <div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
              <button onClick={copyText} style={btnAct(C)}>Копировать текст</button>
              <button onClick={() => takePhoto('reportScreenshot', 'report')} style={{ ...btnAct(C), borderColor: '#f7a26a55', color: '#f7a26a' }}>Сохранить фото</button>
            </div>
            <div id="reportScreenshot" dangerouslySetInnerHTML={{ __html: reportHtml }} />

            {provHtml && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><button onClick={() => takePhoto('provAnalyticsInner', 'providers')} style={{ ...btnAct(C), borderColor: '#f7a26a55', color: '#f7a26a' }}>Сохранить фото провайдеров</button></div>
                <div id="provAnalyticsInner" dangerouslySetInnerHTML={{ __html: provHtml }} />
              </div>
            )}
            {analyticsHtml && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><button onClick={() => takePhoto('analyticsInner', 'analytics')} style={{ ...btnAct(C), borderColor: '#f7a26a55', color: '#f7a26a' }}>Сохранить фото аналитики</button></div>
                <div id="analyticsInner" dangerouslySetInnerHTML={{ __html: analyticsHtml }} />
              </div>
            )}

            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>Текст для отправки</div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 22px', fontFamily: "'Courier New', monospace", fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-wrap', color: C.text }}>{textOut}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function btnAct(C: { surface: string; border: string; text: string }): React.CSSProperties {
  return { background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: "'Manrope', sans-serif", cursor: 'pointer' };
}
