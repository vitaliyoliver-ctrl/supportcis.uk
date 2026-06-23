import { useEffect, useRef } from 'react';
import BackButton from '@/components/BackButton';

// Chatwoot Analyzer — port of tl/data/index.html
// Parses Chatwoot xlsx export: dynamic column detection, source classification,
// CSAT dislike dedup (24h), FCR by topic-tag, per-operator full-shift detection
// (UTC shift windows), per-project stats, and Power Automate webhook push.
// The analysis is a large self-contained imperative module preserved verbatim
// inside a scoped effect; xlsx is loaded on demand.

/* eslint-disable @typescript-eslint/no-explicit-any */

const BODY_HTML = `
<div class="header">
  <div class="logo">Chat<span>Woot</span> Analyzer</div>
  <div class="header-badge">INTERNAL TOOL</div>
</div>
<div class="upload-section">
  <div class="drop-zone" id="dropZone">
    <input type="file" id="fileInput" accept=".xlsx,.xls" />
    <div class="drop-icon">📂</div>
    <div class="drop-title">Загрузи выгрузку Chatwoot (.xlsx)</div>
    <div class="drop-sub">Перетащи файл или кликни для выбора</div>
  </div>
  <div class="filter-bar">
    <label>Дата от</label>
    <input type="date" id="dateFrom" />
    <label>до</label>
    <input type="date" id="dateTo" />
    <span class="file-info" id="fileInfo"></span>
    <button class="btn-analyze" id="analyzeBtn" disabled>Анализировать →</button>
    <button class="btn-send" id="sendBtn" disabled style="margin-left:8px">Отправить в Excel →</button>
    <span class="send-status" id="sendStatus"></span>
  </div>
</div>
<div class="results" id="results">
  <div style="padding: 0 28px;">
    <div class="sec-title">Общие показатели</div>
    <div class="summary-grid" id="summaryGrid"></div>
    <div class="sec-title">По проектам</div>
    <div class="proj-table-wrap">
      <table class="proj-table" id="projTable">
        <thead><tr><th>Проект</th><th>Регуляр</th><th>VIP/Privip</th><th>Всего чатов</th><th>CSAT %</th><th>FCR %</th></tr></thead>
        <tbody id="projBody"></tbody>
      </table>
    </div>
    <div class="sec-title">По операторам — полные смены · средняя длительность</div>
    <div class="ops-filter-bar">
      <button class="ops-filter-btn active" data-filter="all">Все смены</button>
      <button class="ops-filter-btn" data-filter="morning">☀ Утренняя</button>
      <button class="ops-filter-btn" data-filter="day">🌤 Дневная</button>
      <button class="ops-filter-btn" data-filter="night">🌙 Ночная</button>
      <button class="ops-filter-btn" data-filter="active">Только с чатами</button>
    </div>
    <div class="ops-sub-title">Регуляры</div>
    <div class="ops-table-wrap">
      <table class="ops-table" id="opsTableReg">
        <thead><tr><th>Оператор</th><th>Всего чатов</th><th>Соло чатов</th><th>Совместных чатов</th><th>Ср. длит. соло (мин)</th><th>Ср. длит. совм. (мин)</th><th>Эффективность (чат/ч)</th></tr></thead>
        <tbody id="opsBodyReg"></tbody>
      </table>
    </div>
    <div class="ops-sub-title" style="margin-top:24px">ВИП операторы</div>
    <div class="ops-table-wrap">
      <table class="ops-table" id="opsTableVip">
        <thead><tr><th>Оператор</th><th>Всего чатов</th><th>Соло чатов</th><th>Совместных чатов</th><th>Ср. длит. соло (мин)</th><th>Ср. длит. совм. (мин)</th><th>Эффективность (чат/ч)</th></tr></thead>
        <tbody id="opsBodyVip"></tbody>
      </table>
    </div>
  </div>
</div>
`;

const CSS = `
.tldata{--bg:#080a0e;--s1:#0d1117;--s2:#111620;--s3:#161c2a;--border:#1e2535;--border2:#2a3348;--accent:#4f9eff;--accent2:#00e5c0;--accent3:#ff6b6b;--text:#dde3f0;--muted:#4a5568;--label:#7a8ba8;--mono:'IBM Plex Mono',monospace;--head:'Unbounded',sans-serif;background:var(--bg);color:var(--text);font-family:var(--mono);min-height:100vh;}
.tldata *{box-sizing:border-box;}
.tldata .header{background:var(--s1);border-bottom:1px solid var(--border);padding:16px 28px;display:flex;align-items:center;gap:14px;}
.tldata .logo{font-family:var(--head);font-size:15px;font-weight:700;color:var(--text);letter-spacing:-0.02em;}
.tldata .logo span{color:var(--accent);}
.tldata .header-badge{font-size:10px;color:var(--muted);background:var(--s3);border:1px solid var(--border);padding:3px 8px;border-radius:3px;margin-left:auto;}
.tldata .upload-section{padding:28px;max-width:1400px;margin:0 auto;}
.tldata .drop-zone{border:2px dashed var(--border2);border-radius:12px;padding:48px;text-align:center;cursor:pointer;transition:all 0.2s;background:var(--s1);position:relative;}
.tldata .drop-zone:hover,.tldata .drop-zone.drag{border-color:var(--accent);background:rgba(79,158,255,0.04);}
.tldata .drop-zone input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.tldata .drop-icon{font-size:36px;margin-bottom:12px;}
.tldata .drop-title{font-family:var(--head);font-size:14px;color:var(--text);margin-bottom:6px;}
.tldata .drop-sub{font-size:11px;color:var(--muted);}
.tldata .filter-bar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-top:16px;}
.tldata .filter-bar label{font-size:11px;color:var(--label);text-transform:uppercase;letter-spacing:0.08em;}
.tldata .filter-bar input[type="date"]{background:var(--s3);border:1px solid var(--border2);border-radius:6px;padding:7px 12px;font-family:var(--mono);font-size:12px;color:var(--text);outline:none;transition:border-color 0.2s;}
.tldata .filter-bar input[type="date"]:focus{border-color:var(--accent);}
.tldata .btn-analyze{background:linear-gradient(135deg,var(--accent),#2563eb);color:#fff;border:none;border-radius:7px;padding:9px 24px;font-family:var(--head);font-size:11px;font-weight:600;cursor:pointer;letter-spacing:0.04em;transition:opacity 0.2s;margin-left:auto;}
.tldata .btn-analyze:hover{opacity:0.85;}
.tldata .btn-analyze:disabled{opacity:0.4;cursor:not-allowed;}
.tldata .file-info{font-size:11px;color:var(--accent2);}
.tldata .results{max-width:1400px;margin:0 auto;padding:0 28px 48px;display:none;}
.tldata .results.show{display:block;}
.tldata .sec-title{font-family:var(--head);font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:0.12em;margin:28px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;}
.tldata .sec-title::before{content:'';display:block;width:3px;height:14px;background:var(--accent);border-radius:2px;}
.tldata .summary-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;}
.tldata .stat-card{background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;transition:border-color 0.2s;}
.tldata .stat-card:hover{border-color:var(--border2);}
.tldata .stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;line-height:1.4;}
.tldata .stat-value{font-family:var(--head);font-size:20px;font-weight:700;color:var(--text);}
.tldata .stat-value.accent{color:var(--accent);}
.tldata .stat-value.green{color:var(--accent2);}
.tldata .stat-value.red{color:var(--accent3);}
.tldata .proj-table-wrap{overflow-x:auto;}
.tldata table.proj-table{width:100%;border-collapse:collapse;font-size:12px;}
.tldata .proj-table th{background:var(--s3);color:var(--label);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;padding:10px 14px;text-align:left;border-bottom:1px solid var(--border2);white-space:nowrap;}
.tldata .proj-table td{padding:9px 14px;border-bottom:1px solid var(--border);vertical-align:middle;}
.tldata .proj-table tr:hover td{background:rgba(255,255,255,0.02);}
.tldata .proj-name{font-family:var(--head);font-size:11px;font-weight:600;color:var(--text);}
.tldata .num{color:var(--text);font-variant-numeric:tabular-nums;}
.tldata .pct{color:var(--accent2);font-size:11px;}
.tldata .pct-bad{color:var(--accent3);}
.tldata .ops-table-wrap{overflow-x:auto;}
.tldata table.ops-table{width:100%;border-collapse:collapse;font-size:12px;}
.tldata .ops-table th{background:var(--s3);color:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:0.06em;padding:10px 14px;text-align:left;border-bottom:1px solid var(--border2);white-space:nowrap;}
.tldata .ops-table td{padding:8px 14px;border-bottom:1px solid var(--border);}
.tldata .ops-table tr:hover td{background:rgba(255,255,255,0.02);}
.tldata .op-inactive td{opacity:0.35;}
.tldata .ops-filter-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}
.tldata .ops-filter-btn{padding:5px 14px;border-radius:4px;font-family:var(--mono);font-size:11px;cursor:pointer;border:1px solid var(--border2);background:transparent;color:var(--muted);transition:all 0.15s;text-transform:uppercase;letter-spacing:0.06em;}
.tldata .ops-filter-btn:hover{border-color:var(--accent);color:var(--accent);}
.tldata .ops-filter-btn.active{background:rgba(79,158,255,0.15);border-color:var(--accent);color:var(--accent);}
.tldata .ops-sub-title{font-family:var(--head);font-size:10px;font-weight:600;color:var(--label);text-transform:uppercase;letter-spacing:0.12em;margin:20px 0 8px;padding:6px 0;border-bottom:1px solid var(--border);}
.tldata .op-name{color:var(--accent);font-size:12px;}
.tldata .send-status{font-size:11px;padding:6px 12px;border-radius:5px;display:none;}
.tldata .send-status.ok{background:rgba(0,229,192,0.1);border:1px solid var(--accent2);color:var(--accent2);display:block;}
.tldata .send-status.err{background:rgba(255,107,107,0.1);border:1px solid var(--accent3);color:var(--accent3);display:block;}
.tldata .send-status.loading{background:rgba(79,158,255,0.1);border:1px solid var(--accent);color:var(--accent);display:block;}
.tldata .btn-send{background:linear-gradient(135deg,var(--accent2),#00b090);color:#000;border:none;border-radius:7px;padding:9px 20px;font-family:var(--head);font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0.04em;transition:opacity 0.2s;white-space:nowrap;}
.tldata .btn-send:hover{opacity:0.85;}
.tldata .btn-send:disabled{opacity:0.4;cursor:not-allowed;}
`;

const REGULAR_OPERATORS = [
  'Will', 'Kenzo', 'Nora', 'Florence', 'Fletcher', 'Charles', 'Earl', 'Rudy', 'Balfour',
  'Jonathan', 'Bill', 'Gross', 'Meadow', 'Norman', 'Robin', 'Bob', 'Lex', 'Calvin', 'Mike',
  'Sherlock', 'Colin', 'Robert', 'Hardy', 'Murphy', 'Joseph', 'Bowen', 'Bridget',
];
const VIP_OPERATORS = [
  'Simon', 'Elijah', 'Scott', 'Chadwick', 'Holly', 'Tom', 'Fabio', 'River', 'Casper', 'Plover',
  'Morgan', 'Reggie', 'Wade', 'Warren', 'Denzel', 'Felicia', 'Alexia', 'Kiana', 'Ashton', 'Nolan',
  'Trinity', 'Christine', 'Skylar', 'Isaac', 'Irma', 'Amelia SV', 'Oliver', 'Amelia',
];
const ALL_OPERATORS = [...REGULAR_OPERATORS, ...VIP_OPERATORS];
const PROJECTS = ['Cat', 'Gama', 'Daddy', 'Mers', 'Kent', 'R7', 'Kometa', 'Arkada', 'Highroll', 'Atom', 'Motor'];

const WEBHOOK_URL_SG = 'https://defaulte2f944de9f4f4231833c439e8d8d9b.8f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/8ac8d4a24d0c4dfabbafb2330f0cd563/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=t5S9cOQah631lZBnYhQCVMp88IDhn8Qjg-_dBB7kces';
const WEBHOOK_URL_NK = 'https://defaulte2f944de9f4f4231833c439e8d8d9b.8f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/707c15c34dd84298904db48db2654f44/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=xAk_IbkY_akDLZgirLaBzT5o-diiiUeoa1Dgc5VnJLk';

export default function TLDataPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (id: string) => root.querySelector('#' + id) as any;

    // ===== column mapping =====
    let COL: any = {};
    let OP_COLS: { nick: number; dur: number }[] = [];

    function buildColMap(header: any[]) {
      COL = {}; OP_COLS = [];
      header.forEach((h, i) => {
        if (!h) return;
        const name = h.toString().trim();
        if (name === 'ID чата') COL.id = i;
        else if (name === 'Дата и время начала') COL.date = i;
        else if (name === 'Источник') COL.source = i;
        else if (name === 'Группа') COL.group = i;
        else if (name === 'Почта клиента') COL.email = i;
        else if (name === 'Общее время до решения') COL.totalTime = i;
        else if (name === 'Время первого ответа') COL.frt = i;
        else if (name === 'Среднее время ответа') COL.art = i;
        else if (name === 'Общее время длительности чата агентов') COL.agentDur = i;
        else if (name === 'Оценка чата (CSAT)') COL.csat = i;
        else if (name === 'Комментарий к оценке') COL.csatComment = i;
        else if (name === 'Чат попал в очередь') COL.queueTime = i;
        else if (name === 'Имя клиента') COL.clientName = i;
        else if (name === 'Кастом инфо о контакте: _email' || name === 'Кастом инфо о контакте: user_email') COL.customEmail = i;
        else if (name === 'Кастом инфо о контакте: phone' || name === 'Кастом инфо о контакте: user_phone') COL.phone = i;
        else if (name === 'Кастом инфо о контакте: userId' || name === 'Кастом инфо о контакте: user_id') COL.userId = i;
        const opMatch = name.match(/^Ник оператора (\d+)$/);
        if (opMatch) { const n = parseInt(opMatch[1]); OP_COLS[n - 1] = { nick: i, dur: i + 1 }; }
      });
      COL.cats = [];
      header.forEach((h, i) => { if (h && /^Категория \d+$/.test(h.toString().trim())) COL.cats.push(i); });
      COL.op1 = OP_COLS[0]?.nick;
      COL.op5 = OP_COLS[OP_COLS.length - 1]?.nick;
      return COL;
    }

    function classifySource(src: any): string {
      if (!src) return 'unknown';
      src = src.toString().trim();
      const lo = src.toLowerCase();
      if (lo.endsWith(' tg')) return 'tg';
      if (lo.endsWith(' vip')) return 'vip';
      if (lo.endsWith(' privip')) return 'privip';
      if (lo.endsWith(' regular')) return 'regular';
      return 'unknown';
    }
    function getProject(row: any[]): string | null {
      const src = (row[COL.source] || '').toString().trim();
      for (const p of PROJECTS) { if (src.toLowerCase().includes(p.toLowerCase())) return p; }
      return null;
    }
    function getCats(row: any[]): string[] {
      const cats: string[] = [];
      for (const idx of (COL.cats || [])) { const v = (row[idx] || '').toString().trim(); if (v) cats.push(v); }
      return cats;
    }
    function isTG(row: any[]) { return classifySource(row[COL.source]) === 'tg'; }
    function isVIPSource(row: any[]) { return classifySource(row[COL.source]) === 'vip'; }
    function isRegularSource(row: any[]) { const t = classifySource(row[COL.source]); return t === 'regular' || t === 'tg'; }
    function isPrivipSource(row: any[]) { return classifySource(row[COL.source]) === 'privip'; }
    function isBotOnly(row: any[]) { return !hasHumanOp(row); }
    function hasHumanOp(row: any[]) { for (const { nick } of OP_COLS) { if ((row[nick] || '').toString().trim()) return true; } return false; }
    function isVIP(row: any[]) { return isVIPSource(row); }
    function isPrivip(row: any[]) { return isPrivipSource(row); }
    function isRegular(row: any[]) { return isRegularSource(row); }
    function inQueue(row: any[]) { if (COL.queueTime !== undefined) return !!(row[COL.queueTime]); return getCats(row).some((c) => c.toLowerCase() === 'очередь'); }

    const SYSTEM_TAGS = new Set(['bot', 'operator', 'operator_chat', 'vip', 'privip', 'regular', 'tg', 'vip_reactivation']);
    const SALE_WORDS = ['продаж', 'spam', 'спам', 'scam', 'ИИ'];
    function isSaleOrSpam(tag: string) { const lo = tag.toLowerCase(); return SALE_WORDS.some((w) => lo.includes(w)); }
    function getTopicTags(row: any[]): string[] {
      return getCats(row).filter((t) => {
        const lo = t.toLowerCase();
        if (SYSTEM_TAGS.has(lo)) return false;
        if (isSaleOrSpam(t)) return false;
        if (ALL_OPERATORS.map((o) => o.toLowerCase()).includes(lo)) return false;
        return true;
      });
    }
    function isRated(row: any[]) {
      const v = row[COL.csat];
      if (v === null || v === undefined || v === '') return false;
      const s = v.toString().trim().toLowerCase();
      if (s === 'good' || s === 'bad') return true;
      return !isNaN(parseInt(v));
    }
    function isGoodRated(row: any[]) {
      const v = row[COL.csat]; if (!v) return false;
      const s = v.toString().trim().toLowerCase();
      if (s === 'good') return true;
      const n = parseInt(v); return !isNaN(n) && n >= 3;
    }
    function isBadRated(row: any[]) {
      const v = row[COL.csat]; if (!v) return false;
      const s = v.toString().trim().toLowerCase();
      if (s === 'bad') return true;
      const n = parseInt(v); return !isNaN(n) && n <= 2;
    }
    function buildCountedDislikes(allParsedData: any[][]): Set<string> {
      const byVisitorDis: any = {};
      allParsedData.forEach((r) => {
        if (!isBadRated(r)) return;
        const vid = getVisitorId(r); if (!vid) return;
        if (!byVisitorDis[vid]) byVisitorDis[vid] = [];
        byVisitorDis[vid].push(r);
      });
      const counted = new Set<string>();
      Object.values(byVisitorDis).forEach((chats: any) => {
        chats.sort((a: any, b: any) => +new Date(a[COL.date]) - +new Date(b[COL.date]));
        let lastCountedTime: any = null;
        chats.forEach((r: any) => {
          const t: any = new Date(r[COL.date]);
          if (lastCountedTime === null || (t - lastCountedTime) / 3600000 >= 24) { counted.add(getChatId(r)); lastCountedTime = t; }
        });
      });
      return counted;
    }
    function calcCSAT(rows: any[][], countedDislikes: Set<string>): number | null {
      let good = 0, total = 0;
      rows.forEach((r) => {
        if (!isRated(r)) return;
        if (isGoodRated(r)) { good++; total++; }
        else if (isBadRated(r) && countedDislikes.has(getChatId(r))) { total++; }
      });
      return total > 0 ? (good / total * 100) : null;
    }
    function parseDuration(s: any): number | null {
      if (!s) return null;
      s = s.toString().trim();
      const mins = s.match(/(\d+)\s*минут/);
      const secs = s.match(/(\d+)\s*секунд/);
      if (!mins && !secs) return null;
      return (mins ? parseInt(mins[1]) * 60 : 0) + (secs ? parseInt(secs[1]) : 0);
    }
    function getDateStr(row: any[]) { return (row[COL.date] || '').toString().substring(0, 10); }
    function getHour(row: any[]) { return parseInt((row[COL.date] || '').toString().substring(11, 13)) || 0; }
    function getChatId(row: any[]) { return (row[COL.id] || '').toString().trim(); }
    function getVisitorId(row: any[]) {
      const email = (row[COL.email] || row[COL.customEmail] || '').toString().trim().toLowerCase();
      if (email) return email;
      const uid = (row[COL.userId] || '').toString().trim();
      if (uid) return uid;
      const phone = (row[COL.phone] || '').toString().trim();
      if (phone && phone !== 'None') return phone;
      return getChatId(row);
    }
    const SPAM_WORDS = ['spam', 'спам', 'scam'];
    function isSpam(row: any[]) { return getCats(row).some((t) => SPAM_WORDS.some((s) => t.toLowerCase().includes(s))); }

    function avg(arr: number[]) { if (!arr.length) return 0; return arr.reduce((a, b) => a + b, 0) / arr.length; }
    function fmt(n: any, decimals = 0) { if (isNaN(n) || n === null || n === undefined) return '—'; return Number(n).toFixed(decimals); }
    function fmtPct(n: any) { if (isNaN(n) || n === null) return '—'; return Number(n).toFixed(1) + '%'; }
    function secToMin(s: any) { if (!s) return '—'; return (s / 60).toFixed(1); }

    const SHIFT_WINDOWS = [
      { name: 'Утренняя', sh: 6, sm: 0, eh: 18, em: 0, cross: false, stol: 720, etol: 720, span: 3 },
      { name: 'Дневная', sh: 9, sm: 0, eh: 21, em: 0, cross: false, stol: 720, etol: 720, span: 3 },
      { name: 'Ночная', sh: 18, sm: 0, eh: 6, em: 0, cross: true, stol: 720, etol: 720, span: 3 },
    ];
    function makeShiftDates(baseDate: string, sw: any, prevDay: boolean) {
      const [y, m, d] = baseDate.split('-').map(Number);
      let sd = new Date(Date.UTC(y, m - 1, d, sw.sh, sw.sm, 0));
      let ed = new Date(Date.UTC(y, m - 1, d, sw.eh, sw.em, 0));
      if (prevDay) sd = new Date(sd.getTime() - 86400000);
      if (sw.cross && !prevDay) ed = new Date(ed.getTime() + 86400000);
      return { wstart: sd, wend: ed };
    }

    // ===== state =====
    let parsedData: any[][] = [];
    let lastResult: any = null;
    let lastResults: any[] = [];
    let byVisitor: any = {};
    let currentOpsFilter = 'all';
    let fileType: 'sg' | 'nk' = 'sg';
    let opStats: any = {};
    let REGULAR_OPERATORS_GLOBAL: string[] = [];
    let VIP_OPERATORS_GLOBAL: string[] = [];

    // ===== file load =====
    const dropZone = $('dropZone');
    dropZone.addEventListener('dragover', (e: any) => { e.preventDefault(); dropZone.classList.add('drag'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
    dropZone.addEventListener('drop', (e: any) => {
      e.preventDefault(); dropZone.classList.remove('drag');
      const file = e.dataTransfer.files[0]; if (file) handleFile(file);
    });
    $('fileInput').addEventListener('change', (e: any) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

    async function handleFile(file: File) {
      $('fileInfo').textContent = `📄 ${file.name}`;
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      try {
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
        if (raw.length < 2) { alert('Файл пустой или не содержит данных'); return; }
        const header = raw[0];
        if (!header || !header[0] || header[0].toString() !== 'ID чата') {
          alert('⚠ Файл не похож на выгрузку Chatwoot. Ожидается первый столбец "ID чата".'); return;
        }
        buildColMap(header);
        parsedData = raw.slice(1).filter((r) => r && r[0] != null);
        const nkProjects = new Set(['atom', 'motor']);
        const sources = parsedData.map((r) => (r[COL.source] || '').toString().toLowerCase());
        const hasNK = sources.some((s) => nkProjects.has(s.replace(/\s*(support|tg)\s*/gi, '').trim()));
        fileType = hasNK ? 'nk' : 'sg';
        const dates = parsedData.map((r) => getDateStr(r)).filter(Boolean);
        if (dates.length) {
          const unique = [...new Set(dates)].sort();
          const fromD = unique.length > 2 ? unique[1] : unique[0];
          const toD = unique.length > 2 ? unique[unique.length - 2] : unique[unique.length - 1];
          $('dateFrom').value = fromD; $('dateTo').value = toD;
        }
        $('analyzeBtn').disabled = false;
        $('fileInfo').textContent += ` (${parsedData.length} строк)`;
      } catch (err: any) {
        alert('Ошибка чтения файла: ' + err.message);
      }
    }

    // ===== operator rendering =====
    function filterOps(type: string, btn: HTMLElement) {
      currentOpsFilter = type;
      root!.querySelectorAll('.ops-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderOpsRows();
    }
    function buildOpRow(nick: string): string {
      const s = opStats[nick];
      if (!s) return '';
      const avgDur = s.durations.length ? avg(s.durations) : 0;
      const avgMultiDur = s.multiDurations.length ? avg(s.multiDurations) : 0;
      const hasAny = s.chats > 0 || s.multiChats > 0;
      const totalChatsOp = s.chats + s.multiChats;
      const efficiency = s.effHours > 0 ? (totalChatsOp / s.effHours).toFixed(1) : (hasAny ? (totalChatsOp / 12).toFixed(1) : '—');
      const effNum = s.effHours > 0 ? totalChatsOp / s.effHours : (hasAny ? totalChatsOp / 12 : 0);
      const effCls = effNum >= 10 ? 'pct' : effNum >= 6 ? '' : (hasAny ? 'pct pct-bad' : '');
      const isVip = VIP_OPERATORS_GLOBAL.includes(nick);
      const shift = s.shiftType;
      let rowColor = '';
      if (hasAny) {
        if (!isVip) {
          if (shift === 'morning') rowColor = 'rgba(0,200,80,0.08)';
          else if (shift === 'night') rowColor = 'rgba(180,130,255,0.12)';
          else if (shift === 'day') rowColor = 'rgba(255,220,50,0.10)';
        } else {
          if (shift === 'morning') rowColor = 'rgba(200,190,100,0.12)';
          else if (shift === 'night') rowColor = 'rgba(180,50,120,0.15)';
          else if (shift === 'day') rowColor = 'rgba(255,140,0,0.12)';
        }
      }
      let numColor = '';
      if (hasAny) {
        if (!isVip) {
          if (shift === 'morning') numColor = '#00c850';
          else if (shift === 'night') numColor = '#b482ff';
          else if (shift === 'day') numColor = '#e8d040';
        } else {
          if (shift === 'morning') numColor = '#c8be64';
          else if (shift === 'night') numColor = '#c03280';
          else if (shift === 'day') numColor = '#ff8c00';
        }
      }
      const nc = numColor ? `style="color:${numColor};font-weight:600"` : '';
      const nameStyle = numColor ? `style="color:${numColor}"` : '';
      return `<tr class="${hasAny ? '' : 'op-inactive'}" style="background:${rowColor}">
        <td><span class="op-name" ${nameStyle}>${nick}</span></td>
        <td class="num" ${nc}>${totalChatsOp}</td>
        <td class="num" ${nc}>${s.chats}</td>
        <td class="num" ${nc}>${s.multiChats}</td>
        <td class="num">${avgDur > 0 ? secToMin(avgDur) : '—'}</td>
        <td class="num">${avgMultiDur > 0 ? secToMin(avgMultiDur) : '—'}</td>
        <td class="num"><span class="${effCls}">${efficiency}</span></td>
      </tr>`;
    }
    function renderOpsRows() {
      if (!Object.keys(opStats).length) return;
      const f = currentOpsFilter;
      function shouldShow(nick: string) {
        const s = opStats[nick]; if (!s) return false;
        if (f === 'morning') return s.shiftType === 'morning';
        if (f === 'day') return s.shiftType === 'day';
        if (f === 'night') return s.shiftType === 'night';
        if (f === 'active') return s.chats > 0 || s.multiChats > 0;
        return true;
      }
      const regBody = $('opsBodyReg'), vipBody = $('opsBodyVip');
      if (!regBody || !vipBody) return;
      regBody.innerHTML = REGULAR_OPERATORS_GLOBAL.filter(shouldShow).map(buildOpRow).join('') ||
        '<tr><td colspan="7" style="color:var(--muted);text-align:center;padding:16px">Нет данных</td></tr>';
      vipBody.innerHTML = VIP_OPERATORS_GLOBAL.filter(shouldShow).map(buildOpRow).join('') ||
        '<tr><td colspan="7" style="color:var(--muted);text-align:center;padding:16px">Нет данных</td></tr>';
    }

    function computeDayResult(dayStr: string): any {
      const rows = parsedData.filter((r) => getDateStr(r) === dayStr);
      if (!rows.length) return null;
      const totalChats2 = rows.length;
      const botChats2 = rows.filter((r) => isBotOnly(r) && (isRegular(r) || isPrivip(r))).length;
      const botTGChats2 = rows.filter((r) => isBotOnly(r) && isTG(r)).length;
      const botRegularChats2 = rows.filter((r) => isBotOnly(r) && isRegular(r)).length;
      const botPrivipChats2 = rows.filter((r) => isBotOnly(r) && isPrivip(r)).length;
      const tgChats2 = rows.filter(isTG).length;
      const passedBot2 = rows.filter((r) => isRegular(r) || isPrivip(r)).length;
      const allRegPrivip2 = rows.filter((r) => isRegular(r) || isPrivip(r)).length;
      const botClosurePercent2 = allRegPrivip2 > 0 ? (botChats2 / allRegPrivip2 * 100) : 0;
      const botTGClosurePercent2 = tgChats2 > 0 ? (botTGChats2 / tgChats2 * 100) : 0;
      const regularChats2 = rows.filter(isRegular).length;
      const vipChats2 = rows.filter(isVIP).length;
      const privipChats2 = rows.filter(isPrivip).length;
      const passedThroughBotRegular2 = rows.filter((r) => isRegular(r)).length;
      const passedThroughBotTGRegular2 = rows.filter((r) => isTG(r)).length;
      const closedByBotRegular2 = rows.filter((r) => isBotOnly(r) && isRegular(r)).length;
      const closedByBotTGRegular2 = rows.filter((r) => isBotOnly(r) && isTG(r)).length;
      const handledByHumanRegular2 = rows.filter((r) => hasHumanOp(r) && isRegular(r)).length;
      const queueCount2 = rows.filter(inQueue).length;

      const cd2 = buildCountedDislikes(parsedData);
      const nonSpam2 = rows.filter((r) => !isSpam(r));
      const csatAll2 = calcCSAT(nonSpam2, cd2);
      const csatNoBot2 = calcCSAT(nonSpam2.filter(hasHumanOp), cd2);
      const csatBot2 = calcCSAT(nonSpam2.filter(isBotOnly), cd2);
      const csatVip2 = calcCSAT(nonSpam2.filter(isVIP), cd2);
      const csatReg2 = calcCSAT(nonSpam2.filter(isRegular), cd2);

      const frtV2 = rows.map((r) => parseDuration(r[COL.frt])).filter((v) => v !== null && v > 0) as number[];
      const artV2 = rows.map((r) => parseDuration(r[COL.art])).filter((v) => v !== null && v > 0) as number[];
      const durV2 = rows.filter(hasHumanOp).map((r) => parseDuration(r[COL.agentDur])).filter((v) => v !== null && v > 0) as number[];
      const avgDur2 = durV2.length ? avg(durV2) : 0;

      const pidSet2 = new Set(rows.map((r) => getChatId(r)));
      let fcrTotal2 = 0, fcrCount2 = 0;
      const pp2 = new Set<string>();
      Object.values(byVisitor).forEach((chats: any) => {
        const tagChats: any = {};
        chats.forEach((c: any) => { getTopicTags(c).forEach((tag) => { if (!tagChats[tag]) tagChats[tag] = []; tagChats[tag].push(c); }); });
        Object.entries(tagChats).forEach(([tag, tc]: any) => {
          tc.forEach((chat: any, i: number) => {
            if (!pidSet2.has(getChatId(chat))) return;
            const pk = getChatId(chat) + '|' + tag;
            if (pp2.has(pk)) return; pp2.add(pk); fcrTotal2++;
            let isFCR = true;
            if (tc[i + 1]) { const diff = (+new Date(tc[i + 1][COL.date]) - +new Date(chat[COL.date])) / 3600000; if (diff <= 24) isFCR = false; }
            if (isFCR) fcrCount2++;
          });
        });
      });

      const projStats2: any = {};
      PROJECTS.forEach((p) => projStats2[p] = { regular: 0, vip: 0, total: 0, fcrTotal: 0, fcrCount: 0, csatRows: [] });
      rows.forEach((r) => {
        const p = getProject(r); if (!p) return;
        projStats2[p].total++;
        if (isVIP(r)) projStats2[p].vip++; else projStats2[p].regular++;
        if (!isSpam(r)) projStats2[p].csatRows.push(r);
      });
      const pp3: any = {}; PROJECTS.forEach((p) => pp3[p] = new Set());
      Object.values(byVisitor).forEach((chats: any) => {
        const tagChats: any = {};
        chats.forEach((c: any) => { getTopicTags(c).forEach((tag) => { if (!tagChats[tag]) tagChats[tag] = []; tagChats[tag].push(c); }); });
        Object.entries(tagChats).forEach(([tag, tc]: any) => {
          tc.forEach((chat: any, i: number) => {
            if (!pidSet2.has(getChatId(chat))) return;
            const p = getProject(chat); if (!p) return;
            const pk = getChatId(chat) + '|' + tag; if (pp3[p].has(pk)) return; pp3[p].add(pk);
            projStats2[p].fcrTotal++;
            let isFCR = true;
            if (tc[i + 1]) { const diff = (+new Date(tc[i + 1][COL.date]) - +new Date(chat[COL.date])) / 3600000; if (diff <= 24) isFCR = false; }
            if (isFCR) projStats2[p].fcrCount++;
          });
        });
      });

      const periodSet2 = new Set(rows.map((r) => getChatId(r)));
      const nextDayStr = new Date(new Date(dayStr + 'T00:00:00Z').getTime() + 86400000).toISOString().substring(0, 10);
      parsedData.forEach((r) => { const dt = getDateStr(r), h = getHour(r); if (dt === nextDayStr && h < 6) periodSet2.add(getChatId(r)); });

      const opStats2: any = {};
      const _allOps2 = [...(REGULAR_OPERATORS_GLOBAL || []), ...(VIP_OPERATORS_GLOBAL || [])];
      _allOps2.forEach((n) => opStats2[n] = { chats: 0, durations: [], multiChats: 0, multiDurations: [], fullShifts: 0, shiftType: '' });
      const opAllChats2: any = {}, opMultiChats2: any = {};
      _allOps2.forEach((n) => { opAllChats2[n] = []; opMultiChats2[n] = []; });

      parsedData.forEach((r) => {
        const ops: any[] = [];
        for (const { nick: ni, dur: di } of OP_COLS) {
          const nick = (r[ni] || '').toString().trim();
          if (nick) ops.push({ nick, dur: parseDuration(r[di]), col: ni });
        }
        if (!ops.length) return;
        const last = ops[ops.length - 1];
        if (!_allOps2.includes(last.nick)) return;
        if (!opAllChats2[last.nick]) opAllChats2[last.nick] = [];
        if (!opMultiChats2[last.nick]) opMultiChats2[last.nick] = [];
        if (ops.length === 1) opAllChats2[last.nick].push(r);
        else opMultiChats2[last.nick].push(r);
      });

      _allOps2.forEach((nick) => {
        const byDate2: any = {};
        opAllChats2[nick].forEach((r: any) => { const dt = getDateStr(r); if (!byDate2[dt]) byDate2[dt] = { solo: [], multi: [] }; byDate2[dt].solo.push(r); });
        opMultiChats2[nick].forEach((r: any) => { const dt = getDateStr(r); if (!byDate2[dt]) byDate2[dt] = { solo: [], multi: [] }; byDate2[dt].multi.push(r); });
        Object.entries(byDate2).forEach(([ds, dd]: any) => {
          const dsParts = ds.split('-').map(Number);
          const nextDs = new Date(Date.UTC(dsParts[0], dsParts[1] - 1, dsParts[2]) + 86400000).toISOString().substring(0, 10);
          const nd = byDate2[nextDs] || { solo: [], multi: [] };
          const nSolo = nd.solo.filter((r: any) => getHour(r) < 6);
          const nMulti = nd.multi.filter((r: any) => getHour(r) < 6);
          const allDay = [...(dd.solo || []), ...(dd.multi || []), ...nSolo, ...nMulti];
          allDay.sort((a: any, b: any) => +new Date(a[COL.date]) - +new Date(b[COL.date]));
          if (!allDay.length) return;
          const candidates: any[] = [];
          SHIFT_WINDOWS.forEach((sw) => {
            const variants = sw.cross ? [makeShiftDates(ds, sw, false), makeShiftDates(ds, sw, true)] : [makeShiftDates(ds, sw, false)];
            variants.forEach(({ wstart, wend }) => {
              const wchats = allDay.filter((r: any) => { const t: any = new Date(r[COL.date]); return t >= wstart && t <= wend; });
              if (!wchats.length) return;
              const first: any = new Date(wchats[0][COL.date]);
              const last: any = new Date(wchats[wchats.length - 1][COL.date]);
              const span = (last - first) / 3600000;
              if (wchats.length >= 1 && span >= sw.span) candidates.push({ score: -wchats.length, wstart, wend, sw });
            });
          });
          if (!candidates.length) return;
          candidates.sort((a, b) => a.score - b.score);
          const { wstart, wend } = candidates[0];
          const wstartDate = wstart.toISOString().substring(0, 10);
          if (wstartDate !== dayStr) return;
          opStats2[nick].fullShifts++;
          const shiftH = wstart.getUTCHours();
          opStats2[nick].shiftType = shiftH === 6 ? 'morning' : shiftH === 9 ? 'day' : 'night';
          const nextDs2 = new Date(Date.UTC(dsParts[0], dsParts[1] - 1, dsParts[2]) + 86400000).toISOString().substring(0, 10);
          const nd2 = byDate2[nextDs2] || { solo: [], multi: [] };
          const nS2 = nd2.solo.filter((r: any) => getHour(r) < 6);
          const nM2 = nd2.multi.filter((r: any) => getHour(r) < 6);
          function getPersonalDur(r: any) {
            for (const { nick: ni, dur: di } of [...OP_COLS].reverse()) {
              if ((r[ni] || '').toString().trim() === nick) { const d = parseDuration(r[di]); return (d !== null && d > 0) ? d : null; }
            }
            return null;
          }
          [...(dd.solo || []), ...nS2].forEach((r: any) => {
            const t: any = new Date(r[COL.date]);
            if (t < wstart || t > wend) return;
            if (!periodSet2.has(getChatId(r))) return;
            opStats2[nick].chats++;
            const d = getPersonalDur(r); if (d) opStats2[nick].durations.push(d);
          });
          [...(dd.multi || []), ...nM2].forEach((r: any) => {
            const t: any = new Date(r[COL.date]);
            if (t < wstart || t > wend) return;
            if (!periodSet2.has(getChatId(r))) return;
            opStats2[nick].multiChats++;
            const d = getPersonalDur(r); if (d) opStats2[nick].multiDurations.push(d);
          });
        });
      });

      const _pf2: any = {};
      PROJECTS.forEach((p) => {
        const s = projStats2[p];
        const csatP = calcCSAT(s.csatRows, cd2);
        _pf2[`proj_${p}_regular`] = s.regular;
        _pf2[`proj_${p}_vip`] = s.vip;
        _pf2[`proj_${p}_total`] = s.total;
        _pf2[`proj_${p}_csat`] = csatP !== null ? fmt(csatP, 2) : '';
        _pf2[`proj_${p}_fcr`] = s.fcrTotal > 0 ? fmt(s.fcrCount / s.fcrTotal * 100, 2) : '';
      });
      const _of2: any = {};
      _allOps2.forEach((nick) => {
        const s = opStats2[nick] || { chats: 0, durations: [], multiChats: 0 };
        const ad = s.durations.length ? avg(s.durations) : 0;
        const tc = s.chats + s.multiChats;
        _of2[`op_${nick}_chats`] = tc;
        _of2[`op_${nick}_solo`] = s.chats;
        _of2[`op_${nick}_multi`] = s.multiChats;
        _of2[`op_${nick}_dur_min`] = ad > 0 ? fmt(ad / 60, 1) : '0';
        _of2[`op_${nick}_efficiency`] = tc > 0 ? (tc / 12).toFixed(1) : '0';
      });

      return {
        date_from: dayStr, date_to: dayStr,
        total_chats: totalChats2, bot_chats: botChats2,
        bot_closure_percent: fmt(botClosurePercent2, 2),
        bot_regular_chats: botRegularChats2, bot_privip_chats: botPrivipChats2,
        bot_tg_chats: botTGChats2, bot_tg_closure_percent: fmt(botTGClosurePercent2, 2),
        tg_chats: tgChats2, passed_through_bot: passedBot2,
        regular_chats: regularChats2, vip_chats: vipChats2, privip_chats: privipChats2,
        passed_through_bot_regular: passedThroughBotRegular2,
        passed_through_bot_tg_regular: passedThroughBotTGRegular2,
        closed_by_bot_regular: closedByBotRegular2,
        closed_by_bot_tg_regular: closedByBotTGRegular2,
        handled_by_human_regular: handledByHumanRegular2,
        queue_count: queueCount2,
        csat_all: csatAll2 !== null ? fmt(csatAll2, 2) : '',
        csat_no_bot: csatNoBot2 !== null ? fmt(csatNoBot2, 2) : '',
        csat_bot: csatBot2 !== null ? fmt(csatBot2, 2) : '',
        csat_vip: csatVip2 !== null ? fmt(csatVip2, 2) : '',
        csat_regular: csatReg2 !== null ? fmt(csatReg2, 2) : '',
        avg_frt_sec: fmt(avg(frtV2), 1), avg_art_sec: fmt(avg(artV2), 1),
        avg_duration_sec: fmt(avgDur2, 0), avg_duration_min: fmt(avgDur2 / 60, 1),
        fcr_total: fcrTotal2 > 0 ? fmt(fcrCount2 / fcrTotal2 * 100, 2) : '0',
        fcr_resolved: fcrCount2, fcr_chats: fcrTotal2,
        ..._pf2, ..._of2,
        created_at: new Date().toISOString(),
      };
    }

    function analyze() {
      const dateFrom = $('dateFrom').value;
      const dateTo = $('dateTo').value;
      let rows = parsedData;
      if (dateFrom) rows = rows.filter((r) => getDateStr(r) >= dateFrom);
      if (dateTo) rows = rows.filter((r) => getDateStr(r) <= dateTo);
      if (!rows.length) { alert('Нет данных за выбранный период'); return; }

      const totalChats = rows.length;
      const botRows = rows.filter((r) => isBotOnly(r) && (isRegular(r) || isPrivip(r)));
      const botChats = botRows.length;
      const botTGChats = rows.filter((r) => isBotOnly(r) && isTG(r)).length;
      const botRegularChats = rows.filter((r) => isBotOnly(r) && isRegular(r)).length;
      const botPrivipChats = rows.filter((r) => isBotOnly(r) && isPrivip(r)).length;
      const tgChats = rows.filter(isTG).length;
      const passedThroughBot = rows.filter((r) => isRegular(r) || isPrivip(r)).length;
      const allRegPrivip = rows.filter((r) => isRegular(r) || isPrivip(r)).length;
      const allTGChatsBot = tgChats;
      const botClosurePercent = allRegPrivip > 0 ? (botChats / allRegPrivip * 100) : 0;
      const botTGClosurePercent = allTGChatsBot > 0 ? (botTGChats / allTGChatsBot * 100) : 0;
      const passedThroughBotRegular = rows.filter((r) => isRegular(r)).length;
      const passedThroughBotTGRegular = rows.filter((r) => isTG(r)).length;
      const closedByBotRegular = rows.filter((r) => isBotOnly(r) && isRegular(r)).length;
      const closedByBotTGRegular = rows.filter((r) => isBotOnly(r) && isTG(r)).length;
      const handledByHumanRegular = rows.filter((r) => hasHumanOp(r) && isRegular(r)).length;
      const regularChats = rows.filter((r) => isRegular(r)).length;
      const vipChats = rows.filter((r) => isVIP(r)).length;
      const privipChats = rows.filter((r) => isPrivip(r)).length;
      const totalQueue = rows.filter(inQueue).length;

      const countedDislikes = buildCountedDislikes(parsedData);
      const nonSpamRows = rows.filter((r) => !isSpam(r));
      const csatAll = calcCSAT(nonSpamRows, countedDislikes);
      const withOpRows = nonSpamRows.filter(hasHumanOp);
      const csatNoBot = calcCSAT(withOpRows, countedDislikes);
      const botOnlyRows = nonSpamRows.filter(isBotOnly);
      const csatBot = calcCSAT(botOnlyRows, countedDislikes);
      const vipNonSpam = nonSpamRows.filter(isVIP);
      const csatVip = calcCSAT(vipNonSpam, countedDislikes);
      const regNonSpam = nonSpamRows.filter(isRegular);
      const csatReg = calcCSAT(regNonSpam, countedDislikes);

      const frtVals = rows.map((r) => parseDuration(r[COL.frt])).filter((v) => v !== null && v > 0) as number[];
      const artVals = rows.map((r) => parseDuration(r[COL.art])).filter((v) => v !== null && v > 0) as number[];
      const avgFRT = avg(frtVals);
      const avgART = avg(artVals);
      const durVals = rows.filter(hasHumanOp).map((r) => parseDuration(r[COL.agentDur])).filter((v) => v !== null && v > 0) as number[];
      const avgDurSec = avg(durVals);
      const avgDurMin = avgDurSec / 60;

      const allRows = parsedData;
      byVisitor = {};
      allRows.forEach((r) => { const vid = getVisitorId(r); if (!vid) return; if (!byVisitor[vid]) byVisitor[vid] = []; byVisitor[vid].push(r); });
      Object.values(byVisitor).forEach((chats: any) => chats.sort((a: any, b: any) => +new Date(a[COL.date]) - +new Date(b[COL.date])));

      const periodIds = new Set(rows.map((r) => getChatId(r)));
      let fcrTotal = 0, fcrCount = 0;
      const processedPairs = new Set<string>();
      Object.values(byVisitor).forEach((chats: any) => {
        const tagChats: any = {};
        chats.forEach((c: any) => { getTopicTags(c).forEach((tag) => { if (!tagChats[tag]) tagChats[tag] = []; tagChats[tag].push(c); }); });
        Object.entries(tagChats).forEach(([tag, tc]: any) => {
          tc.forEach((chat: any, i: number) => {
            if (!periodIds.has(getChatId(chat))) return;
            const pairKey = getChatId(chat) + '|' + tag;
            if (processedPairs.has(pairKey)) return;
            processedPairs.add(pairKey); fcrTotal++;
            let isFCR = true;
            if (tc[i + 1]) { const diff = (+new Date(tc[i + 1][COL.date]) - +new Date(chat[COL.date])) / 3600000; if (diff <= 24) isFCR = false; }
            if (isFCR) fcrCount++;
          });
        });
      });
      const fcr = fcrTotal > 0 ? (fcrCount / fcrTotal * 100) : 0;

      const fmtCSAT = (v: any) => v !== null ? fmtPct(v) : '—';
      const csatCls = (v: any) => v === null ? '' : (v >= 80 ? 'green' : 'red');
      const summaryData = [
        { label: 'Всего чатов', value: totalChats, cls: '' },
        { label: 'Закрыто ботом (Рег + Привип)', value: botChats, cls: 'accent' },
        { label: 'Процент закрытия ботом', value: fmtPct(botClosurePercent), cls: botClosurePercent >= 30 ? 'green' : '' },
        { label: 'Закрыто ботом Регуляр', value: botRegularChats, cls: 'accent' },
        { label: 'Закрыто ботом Привип', value: botPrivipChats, cls: 'accent' },
        { label: 'Закрыто ботом ТГ', value: botTGChats, cls: 'accent' },
        { label: 'Процент закрытия ботом ТГ', value: fmtPct(botTGClosurePercent), cls: botTGClosurePercent >= 30 ? 'green' : '' },
        { label: 'Все ТГ чаты', value: tgChats, cls: '' },
        { label: 'Прошли через бота (Рег + Привип)', value: passedThroughBot, cls: 'accent' },
        { label: 'Прошли через бота Регуляр', value: passedThroughBotRegular, cls: 'accent' },
        { label: 'Прошли через бота ТГ', value: passedThroughBotTGRegular, cls: 'accent' },
        { label: 'Решены ботом Регуляр', value: closedByBotRegular, cls: 'accent' },
        { label: 'Решены ботом ТГ', value: closedByBotTGRegular, cls: 'accent' },
        { label: 'Обработано людьми Регуляр', value: handledByHumanRegular, cls: 'accent' },
        { label: 'Регуляр чаты (Рег + ТГ)', value: regularChats, cls: '' },
        { label: 'VIP чаты', value: vipChats, cls: '' },
        { label: 'Привип чаты', value: privipChats, cls: '' },
        { label: 'Людей в очереди', value: totalQueue, cls: '' },
        { label: 'CSAT все (без спама)', value: fmtCSAT(csatAll), cls: csatCls(csatAll) },
        { label: 'CSAT без бота', value: fmtCSAT(csatNoBot), cls: csatCls(csatNoBot) },
        { label: 'CSAT бота', value: fmtCSAT(csatBot), cls: csatCls(csatBot) },
        { label: 'CSAT VIP', value: fmtCSAT(csatVip), cls: csatCls(csatVip) },
        { label: 'CSAT Регуляр', value: fmtCSAT(csatReg), cls: csatCls(csatReg) },
        { label: 'Первое время ответа (сек)', value: fmt(avgFRT, 1), cls: '' },
        { label: 'Среднее время ответа (сек)', value: fmt(avgART, 1), cls: '' },
        { label: 'Длит. оператора (сек)', value: fmt(avgDurSec, 0), cls: '' },
        { label: 'Длит. оператора (мин)', value: fmt(avgDurMin, 1), cls: '' },
        { label: 'FCR общий', value: fmtPct(fcr), cls: fcr >= 80 ? 'green' : 'red' },
      ];
      $('summaryGrid').innerHTML = summaryData.map((s) => `<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value ${s.cls || ''}">${s.value}</div></div>`).join('');

      const projStats: any = {};
      PROJECTS.forEach((p) => projStats[p] = { regular: 0, vip: 0, total: 0, csatRows: [], fcrTotal: 0, fcrCount: 0 });
      rows.forEach((r) => {
        const p = getProject(r); if (!p) return;
        projStats[p].total++;
        if (isVIP(r)) projStats[p].vip++; else projStats[p].regular++;
        if (!isSpam(r)) projStats[p].csatRows.push(r);
      });
      const projProcessed: any = {};
      PROJECTS.forEach((p) => projProcessed[p] = new Set());
      Object.values(byVisitor).forEach((chats: any) => {
        const tagChats: any = {};
        chats.forEach((c: any) => { getTopicTags(c).forEach((tag) => { if (!tagChats[tag]) tagChats[tag] = []; tagChats[tag].push(c); }); });
        Object.entries(tagChats).forEach(([tag, tc]: any) => {
          tc.forEach((chat: any, i: number) => {
            if (!periodIds.has(getChatId(chat))) return;
            const p = getProject(chat); if (!p) return;
            const pairKey = getChatId(chat) + '|' + tag;
            if (projProcessed[p].has(pairKey)) return;
            projProcessed[p].add(pairKey);
            projStats[p].fcrTotal++;
            let isFCR = true;
            if (tc[i + 1]) { const diff = (+new Date(tc[i + 1][COL.date]) - +new Date(chat[COL.date])) / 3600000; if (diff <= 24) isFCR = false; }
            if (isFCR) projStats[p].fcrCount++;
          });
        });
      });
      $('projBody').innerHTML = PROJECTS.map((p) => {
        const s = projStats[p];
        if (!s.total) return '';
        const csat = calcCSAT(s.csatRows, countedDislikes);
        const fcrP = s.fcrTotal > 0 ? (s.fcrCount / s.fcrTotal * 100) : null;
        const csatClsP = csat !== null ? (csat >= 80 ? 'pct' : 'pct pct-bad') : '';
        const fcrCls = fcrP !== null ? (fcrP >= 80 ? 'pct' : 'pct pct-bad') : '';
        return `<tr>
          <td><span class="proj-name">${p}</span></td>
          <td class="num">${s.regular}</td>
          <td class="num">${s.vip}</td>
          <td class="num">${s.total}</td>
          <td><span class="${csatClsP}">${csat !== null ? fmtPct(csat) : '—'}</span></td>
          <td><span class="${fcrCls}">${fcrP !== null ? fmtPct(fcrP) : '—'}</span></td>
        </tr>`;
      }).join('');

      // BY OPERATOR
      function getOpsWithDur(r: any) {
        const ops: any[] = [];
        for (const { nick: ni, dur: di } of OP_COLS) {
          const nick = (r[ni] || '').toString().trim();
          if (nick) { const dur = parseDuration(r[di]); ops.push({ nick, dur, col: ni }); }
        }
        return ops;
      }
      const detectedOps = new Set<string>();
      parsedData.forEach((r) => { for (const { nick: ni } of OP_COLS) { const nick = (r[ni] || '').toString().trim(); if (nick) detectedOps.add(nick); } });
      const effectiveRegular = [...new Set([
        ...REGULAR_OPERATORS.filter((n) => detectedOps.has(n)),
        ...[...detectedOps].filter((n) => !ALL_OPERATORS.includes(n)),
      ])];
      const effectiveVip = VIP_OPERATORS.filter((n) => detectedOps.has(n));
      const effectiveAll = [...effectiveRegular, ...effectiveVip];
      REGULAR_OPERATORS_GLOBAL = effectiveRegular;
      VIP_OPERATORS_GLOBAL = effectiveVip;

      const opAllChats: any = {}; effectiveAll.forEach((n) => opAllChats[n] = []);
      const opMultiChats: any = {}; effectiveAll.forEach((n) => opMultiChats[n] = []);
      parsedData.forEach((r) => {
        const ops = getOpsWithDur(r);
        if (!ops.length) return;
        const last = ops[ops.length - 1];
        if (!effectiveAll.includes(last.nick)) return;
        if (ops.length === 1) opAllChats[last.nick].push({ r, dur: last.dur });
        else opMultiChats[last.nick].push({ r, dur: last.dur });
      });
      opStats = {};
      ALL_OPERATORS.forEach((n) => { if (!opStats[n]) opStats[n] = { chats: 0, durations: [], multiChats: 0, multiDurations: [], fullShifts: 0, shiftType: '', effHours: 0 }; });
      effectiveAll.forEach((n) => opStats[n] = { chats: 0, durations: [], multiChats: 0, multiDurations: [], fullShifts: 0, shiftType: '', effHours: 0 });

      const periodDates = new Set(rows.map((r) => getDateStr(r)));
      const periodIdSet = new Set<string>();
      parsedData.forEach((r) => {
        const dt = getDateStr(r), h = getHour(r);
        if (periodDates.has(dt)) { periodIdSet.add(getChatId(r)); return; }
        if (h < 6) {
          const [y, mo, da] = dt.split('-').map(Number);
          const d = new Date(Date.UTC(y, mo - 1, da) - 86400000);
          const prevDay = d.toISOString().substring(0, 10);
          if (periodDates.has(prevDay)) periodIdSet.add(getChatId(r));
        }
      });

      effectiveAll.forEach((nick) => {
        const byDate: any = {};
        (opAllChats[nick] || []).forEach(({ r }: any) => { const dt = getDateStr(r); if (!dt) return; if (!byDate[dt]) byDate[dt] = { solo: [], multi: [] }; byDate[dt].solo.push(r); });
        (opMultiChats[nick] || []).forEach(({ r }: any) => { const dt = getDateStr(r); if (!dt) return; if (!byDate[dt]) byDate[dt] = { solo: [], multi: [] }; byDate[dt].multi.push(r); });
        Object.entries(byDate).forEach(([dateStr, dayData]: any) => {
          const dp = dateStr.split('-').map(Number);
          const nextDate = new Date(Date.UTC(dp[0], dp[1] - 1, dp[2]));
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
          const nextDateStr = nextDate.toISOString().substring(0, 10);
          const nextData = byDate[nextDateStr] || { solo: [], multi: [] };
          const allDayChats = [
            ...(dayData.solo || []), ...(dayData.multi || []),
            ...(nextData.solo || []).filter((r: any) => getHour(r) < 6),
            ...(nextData.multi || []).filter((r: any) => getHour(r) < 6),
          ];
          allDayChats.sort((a: any, b: any) => +new Date(a[COL.date]) - +new Date(b[COL.date]));
          if (!allDayChats.length) return;
          const candidates: any[] = [];
          SHIFT_WINDOWS.forEach((sw) => {
            const variants = sw.cross ? [makeShiftDates(dateStr, sw, false), makeShiftDates(dateStr, sw, true)] : [makeShiftDates(dateStr, sw, false)];
            variants.forEach(({ wstart, wend }) => {
              const wchats = allDayChats.filter((r: any) => { const t: any = new Date(r[COL.date]); return t >= wstart && t <= wend; });
              if (!wchats.length) return;
              const first: any = new Date(wchats[0][COL.date]);
              const last: any = new Date(wchats[wchats.length - 1][COL.date]);
              const span = (last - first) / 3600000;
              if (wchats.length >= 1 && span >= sw.span) candidates.push({ score: -wchats.length, wstart, wend, sw });
            });
          });
          if (!candidates.length) return;
          candidates.sort((a, b) => a.score - b.score);
          const { wstart, wend } = candidates[0];
          const wstartDate = wstart.toISOString().substring(0, 10);
          if (wstartDate !== dateStr) return;
          opStats[nick].fullShifts++;
          const wchatsEff = allDayChats.filter((r: any) => { const t: any = new Date(r[COL.date]); return t >= wstart && t <= wend; });
          if (wchatsEff.length >= 2) {
            const tFirst: any = new Date(wchatsEff[0][COL.date]);
            const tLast: any = new Date(wchatsEff[wchatsEff.length - 1][COL.date]);
            opStats[nick].effHours += (tLast - tFirst) / 3600000;
          } else opStats[nick].effHours += 1;
          const shiftH = wstart.getUTCHours();
          opStats[nick].shiftType = shiftH === 6 ? 'morning' : shiftH === 9 ? 'day' : 'night';
          const nextDateStr2 = new Date(Date.UTC(dp[0], dp[1] - 1, dp[2]) + 86400000).toISOString().substring(0, 10);
          const nextData2 = byDate[nextDateStr2] || { solo: [], multi: [] };
          const nextSolo = nextData2.solo.filter((r: any) => getHour(r) < 6);
          const nextMulti = nextData2.multi.filter((r: any) => getHour(r) < 6);
          [...(dayData.solo || []), ...nextSolo].forEach((r: any) => {
            const t: any = new Date(r[COL.date]);
            if (t < wstart || t > wend) return;
            if (!periodIdSet.has(getChatId(r))) return;
            opStats[nick].chats++;
            for (const { nick: ni, dur: di } of [...OP_COLS].reverse()) {
              if ((r[ni] || '').toString().trim() === nick) { const d = parseDuration(r[di]); if (d !== null && d > 0) opStats[nick].durations.push(d); break; }
            }
          });
          [...(dayData.multi || []), ...nextMulti].forEach((r: any) => {
            const t: any = new Date(r[COL.date]);
            if (t < wstart || t > wend) return;
            if (!periodIdSet.has(getChatId(r))) return;
            opStats[nick].multiChats++;
            for (const { nick: ni, dur: di } of [...OP_COLS].reverse()) {
              if ((r[ni] || '').toString().trim() === nick) { const d = parseDuration(r[di]); if (d !== null && d > 0) opStats[nick].multiDurations.push(d); break; }
            }
          });
        });
      });

      currentOpsFilter = 'all';
      root!.querySelectorAll('.ops-filter-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      renderOpsRows();

      const _projFlat: any = {};
      PROJECTS.forEach((p) => {
        const s = projStats[p];
        const csatP = calcCSAT(s.csatRows, countedDislikes);
        const fcrP = s.fcrTotal > 0 ? fmt(s.fcrCount / s.fcrTotal * 100, 2) : null;
        _projFlat[`proj_${p}_regular`] = s.regular;
        _projFlat[`proj_${p}_vip`] = s.vip;
        _projFlat[`proj_${p}_total`] = s.total;
        _projFlat[`proj_${p}_csat`] = csatP !== null ? fmt(csatP, 2) : '';
        _projFlat[`proj_${p}_fcr`] = fcrP ?? '';
      });
      const _opFlat: any = {};
      effectiveAll.forEach((nick) => {
        const s = opStats[nick] || { chats: 0, durations: [], multiChats: 0, fullShifts: 0, effHours: 0 };
        const avgDur = s.durations.length ? avg(s.durations) : 0;
        const totalC = s.chats + s.multiChats;
        const effVal = s.effHours > 0 ? (totalC / s.effHours).toFixed(1) : '0';
        _opFlat[`op_${nick}_chats`] = totalC;
        _opFlat[`op_${nick}_solo`] = s.chats;
        _opFlat[`op_${nick}_multi`] = s.multiChats;
        _opFlat[`op_${nick}_dur_min`] = avgDur > 0 ? secToMin(avgDur) : '0';
        _opFlat[`op_${nick}_efficiency`] = effVal;
      });

      lastResult = {
        date_from: dateFrom, date_to: dateTo,
        total_chats: totalChats, bot_chats: botChats,
        bot_closure_percent: fmt(botClosurePercent, 2),
        bot_regular_chats: botRegularChats, bot_privip_chats: botPrivipChats,
        bot_tg_chats: botTGChats, bot_tg_closure_percent: fmt(botTGClosurePercent, 2),
        tg_chats: tgChats, passed_through_bot: passedThroughBot,
        regular_chats: regularChats, vip_chats: vipChats, privip_chats: privipChats,
        passed_through_bot_regular: passedThroughBotRegular,
        passed_through_bot_tg_regular: passedThroughBotTGRegular,
        closed_by_bot_regular: closedByBotRegular,
        closed_by_bot_tg_regular: closedByBotTGRegular,
        handled_by_human_regular: handledByHumanRegular,
        queue_count: totalQueue,
        csat_all: csatAll !== null ? fmt(csatAll, 2) : '',
        csat_no_bot: csatNoBot !== null ? fmt(csatNoBot, 2) : '',
        csat_bot: csatBot !== null ? fmt(csatBot, 2) : '',
        csat_vip: csatVip !== null ? fmt(csatVip, 2) : '',
        csat_regular: csatReg !== null ? fmt(csatReg, 2) : '',
        avg_frt_sec: fmt(avgFRT, 1), avg_art_sec: fmt(avgART, 1),
        avg_duration_sec: fmt(avgDurSec, 0), avg_duration_min: fmt(avgDurMin, 1),
        fcr_total: fmt(fcr, 2), fcr_resolved: fcrCount, fcr_chats: fcrTotal,
        ..._projFlat, ..._opFlat,
        created_at: new Date().toISOString(),
      };

      $('results').classList.add('show');
      $('results').scrollIntoView({ behavior: 'smooth' });

      lastResults = [];
      const df = new Date(dateFrom + 'T00:00:00Z');
      const dtv = new Date(dateTo + 'T00:00:00Z');
      for (let d = new Date(df); d <= dtv; d.setUTCDate(d.getUTCDate() + 1)) {
        const dayStr = d.toISOString().substring(0, 10);
        const dayResult = computeDayResult(dayStr);
        if (dayResult) lastResults.push(dayResult);
      }
      $('sendBtn').disabled = false;
    }

    function setStatus(msg: string, type: string) {
      const el = $('sendStatus');
      el.textContent = msg;
      el.className = 'send-status ' + type;
    }
    async function sendWebhook() {
      if (!lastResult && !lastResults) { setStatus('⚠ Сначала проанализируй данные', 'err'); return; }
      const webhookUrl = fileType === 'nk' ? WEBHOOK_URL_NK : WEBHOOK_URL_SG;
      const label = fileType === 'nk' ? 'НК' : 'СГ';
      setStatus(`⏳ Отправка (${label})...`, 'loading');
      $('sendBtn').disabled = true;
      try {
        const results = lastResults || [lastResult];
        for (const result of results) {
          await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
        }
        const n = (lastResults && lastResults.length) || 1;
        setStatus(`✓ Отправлено ${n} ${n === 1 ? 'запись' : 'записей'} → ${label}`, 'ok');
      } catch {
        setStatus('✗ Ошибка соединения', 'err');
      }
      $('sendBtn').disabled = false;
    }

    // wire handlers (replace inline onclick from original)
    $('analyzeBtn').addEventListener('click', analyze);
    $('sendBtn').addEventListener('click', sendWebhook);
    root.querySelectorAll('.ops-filter-btn').forEach((b) => {
      b.addEventListener('click', () => filterOps((b as HTMLElement).dataset.filter!, b as HTMLElement));
    });
  }, []);

  return (
    <div className="tldata" ref={rootRef} style={{ paddingTop: 56 }}>
      <style>{CSS}</style>
      <BackButton to="/tl" />
      <div dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
    </div>
  );
}
