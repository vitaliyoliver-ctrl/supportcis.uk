import { useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import BackButton from '@/components/BackButton';

// КСАТ Анализатор — порт tl/csat/index.html.
// Полностью клиентский: грузит выгрузку Chatwoot (.xlsx), считает КСАТ с
// исключением спам-дизлайков (дедуп 24ч) и рисует сводку/разбивки/таблицы.
// Логика портирована дословно в scoped-эффект; глобальный XLSX из CDN заменён
// на бандл-зависимость, инлайновый onclick — на слушатель в эффекте.

const CSS = `
.tlcsat {
  --bg: #080a0e; --s1: #0d1117; --s2: #111620; --s3: #161c2a;
  --border: #1e2535; --border2: #2a3348;
  --accent: #4f8ef7; --accent2: #00e5c0; --accent3: #ff6b6b; --accent4: #ffd166;
  --text: #dde3f0; --muted: #4a5568; --label: #7a8ba8;
  --mono: 'IBM Plex Mono', monospace; --head: 'Unbounded', sans-serif;
  background: var(--bg); color: var(--text); font-family: var(--mono); min-height: 100vh;
}
.tlcsat * { box-sizing: border-box; margin: 0; padding: 0; }

.tlcsat .header {
  background: var(--s1); border-bottom: 1px solid var(--border);
  padding: 16px 28px; display: flex; align-items: center; gap: 14px;
}
.tlcsat .logo { font-family: var(--head); font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
.tlcsat .logo span { color: var(--accent); }
.tlcsat .header-badge { font-size: 10px; color: var(--muted); background: var(--s3); border: 1px solid var(--border); padding: 3px 8px; border-radius: 3px; margin-left: auto; }

.tlcsat .upload-section { padding: 28px; max-width: 1400px; margin: 0 auto; }

.tlcsat .info-box {
  background: rgba(79,142,247,0.06); border: 1px solid rgba(79,142,247,0.25);
  border-radius: 10px; padding: 14px 18px; margin-bottom: 16px;
  font-size: 11px; color: var(--label); line-height: 1.7;
}
.tlcsat .info-box strong { color: var(--accent); }

.tlcsat .drop-zone {
  border: 2px dashed var(--border2); border-radius: 12px; padding: 40px;
  text-align: center; cursor: pointer; transition: all 0.2s; background: var(--s1); position: relative;
}
.tlcsat .drop-zone:hover, .tlcsat .drop-zone.drag { border-color: var(--accent); background: rgba(79,142,247,0.04); }
.tlcsat .drop-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.tlcsat .drop-icon { font-size: 32px; margin-bottom: 10px; }
.tlcsat .drop-title { font-family: var(--head); font-size: 13px; color: var(--text); margin-bottom: 5px; }
.tlcsat .drop-sub { font-size: 11px; color: var(--muted); }

.tlcsat .filter-bar {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  background: var(--s1); border: 1px solid var(--border);
  border-radius: 10px; padding: 14px 18px; margin-top: 14px;
}
.tlcsat .filter-bar label { font-size: 11px; color: var(--label); text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; }
.tlcsat .filter-bar input[type="date"] {
  background: var(--s3); border: 1px solid var(--border2); border-radius: 6px;
  padding: 7px 12px; font-family: var(--mono); font-size: 12px; color: var(--text);
  outline: none; transition: border-color 0.2s;
}
.tlcsat .filter-bar input[type="date"]:focus { border-color: var(--accent); }
.tlcsat .btn-analyze {
  background: linear-gradient(135deg, var(--accent), #2563eb); color: #fff; border: none;
  border-radius: 7px; padding: 9px 24px; font-family: var(--head); font-size: 11px;
  font-weight: 600; cursor: pointer; letter-spacing: 0.04em; transition: opacity 0.2s; margin-left: auto;
}
.tlcsat .btn-analyze:hover { opacity: 0.85; }
.tlcsat .btn-analyze:disabled { opacity: 0.4; cursor: not-allowed; }
.tlcsat .file-info { font-size: 11px; color: var(--accent2); }
.tlcsat .spam-badge {
  font-size: 10px; background: rgba(255,107,107,0.12); border: 1px solid rgba(255,107,107,0.3);
  color: var(--accent3); border-radius: 4px; padding: 3px 10px; white-space: nowrap;
}

.tlcsat .results { max-width: 1400px; margin: 0 auto; padding: 0 28px 56px; display: none; }
.tlcsat .results.show { display: block; }

.tlcsat .sec-title {
  font-family: var(--head); font-size: 11px; font-weight: 600; color: var(--accent);
  text-transform: uppercase; letter-spacing: 0.12em; margin: 32px 0 14px; padding-bottom: 8px;
  border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px;
}
.tlcsat .sec-title::before { content: ''; display: block; width: 3px; height: 14px; background: var(--accent); border-radius: 2px; }
.tlcsat .sec-subtitle { font-size: 10px; color: var(--muted); margin-left: auto; font-weight: 400; letter-spacing: 0; text-transform: none; }

.tlcsat .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.tlcsat .stat-card { background: var(--s2); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; transition: border-color 0.2s; }
.tlcsat .stat-card:hover { border-color: var(--border2); }
.tlcsat .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; line-height: 1.5; }
.tlcsat .stat-value { font-family: var(--head); font-size: 20px; font-weight: 700; color: var(--text); }
.tlcsat .stat-value.green { color: var(--accent2); }
.tlcsat .stat-value.red { color: var(--accent3); }
.tlcsat .stat-value.yellow { color: var(--accent4); }
.tlcsat .stat-value.blue { color: var(--accent); }
.tlcsat .stat-sub { font-size: 10px; color: var(--muted); margin-top: 4px; }

.tlcsat .dim-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.tlcsat .dim-card { background: var(--s2); border: 1px solid var(--border); border-radius: 10px; padding: 18px 18px 14px; }
.tlcsat .dim-card-title {
  font-family: var(--head); font-size: 10px; font-weight: 600; color: var(--label);
  text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.tlcsat .dim-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; }
.tlcsat .dim-row + .dim-row { border-top: 1px solid rgba(255,255,255,0.04); }
.tlcsat .dim-label { font-size: 11px; color: var(--label); }
.tlcsat .dim-val { font-family: var(--head); font-size: 13px; font-weight: 600; }
.tlcsat .dim-sub { font-size: 10px; color: var(--muted); margin-top: 1px; }

.tlcsat .table-wrap { overflow-x: auto; }
.tlcsat table.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.tlcsat .data-table th {
  background: var(--s3); color: var(--label); font-weight: 600; font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left;
  border-bottom: 1px solid var(--border2); white-space: nowrap;
}
.tlcsat .data-table td { padding: 9px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; white-space: nowrap; }
.tlcsat .data-table tr:last-child td { border-bottom: none; }
.tlcsat .data-table tr:hover td { background: rgba(255,255,255,0.02); }
.tlcsat .data-table tr.total-row td { background: rgba(79,142,247,0.06); font-weight: 600; }
.tlcsat .data-table tr.total-row:hover td { background: rgba(79,142,247,0.10); }
.tlcsat .proj-name { font-family: var(--head); font-size: 11px; font-weight: 600; color: var(--text); }
.tlcsat .num { font-variant-numeric: tabular-nums; }

.tlcsat .pct-good { color: var(--accent2); font-weight: 600; }
.tlcsat .pct-mid  { color: var(--accent4); font-weight: 600; }
.tlcsat .pct-bad  { color: var(--accent3); font-weight: 600; }
.tlcsat .pct-none { color: var(--muted); }

.tlcsat .csat-bar-wrap { display: flex; align-items: center; gap: 8px; }
.tlcsat .csat-bar { height: 4px; border-radius: 2px; background: var(--s3); flex: 1; min-width: 40px; }
.tlcsat .csat-bar-fill { height: 100%; border-radius: 2px; transition: width 0.4s; }

.tlcsat .spam-info {
  display: flex; gap: 20px; flex-wrap: wrap; background: rgba(255,107,107,0.05);
  border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; padding: 14px 18px; margin-top: 12px; font-size: 11px;
}
.tlcsat .spam-info-item { display: flex; flex-direction: column; gap: 3px; }
.tlcsat .spam-info-label { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
.tlcsat .spam-info-val { color: var(--accent3); font-family: var(--head); font-size: 14px; font-weight: 700; }

.tlcsat .empty { text-align: center; padding: 40px; color: var(--muted); font-size: 12px; }
`;

const BODY_HTML = `
<div class="header">
  <div class="logo">КСАТ <span>Анализатор</span></div>
  <div class="header-badge">WITHOUT SPAM · TL TOOL</div>
</div>

<div class="upload-section">
  <div class="info-box">
    <strong>Важно:</strong> Загружай выгрузку Chatwoot начиная <strong>на день раньше</strong> начала нужного периода.
    Это нужно для корректного исключения спам-дизлайков — дизлайк не считается, если тот же пользователь
    уже ставил дизлайк менее 24 часов назад.
    Например, если считаешь КСАТ с <strong>10 июня</strong>, загружай выгрузку с <strong>9 июня</strong>.
  </div>

  <div class="drop-zone" id="dropZone">
    <input type="file" id="fileInput" accept=".xlsx,.xls" />
    <div class="drop-icon">📂</div>
    <div class="drop-title">Загрузи выгрузку Chatwoot (.xlsx)</div>
    <div class="drop-sub">Перетащи файл или кликни для выбора · файл должен начинаться на день раньше периода</div>
  </div>

  <div class="filter-bar">
    <label>Период с</label>
    <input type="date" id="dateFrom" />
    <label>по</label>
    <input type="date" id="dateTo" />
    <span class="file-info" id="fileInfo"></span>
    <span class="spam-badge" id="spamBadge" style="display:none">⛔ Спам исключён</span>
    <button class="btn-analyze" id="analyzeBtn" disabled>Анализировать →</button>
  </div>
</div>

<div class="results" id="results">
  <div style="padding: 0 28px;">
    <div class="sec-title">Итого за период <span class="sec-subtitle" id="periodLabel"></span></div>
    <div class="summary-grid" id="summaryGrid"></div>
    <div class="spam-info" id="spamInfo"></div>
    <div class="sec-title">Разбивка КСАТ</div>
    <div class="dim-grid" id="dimGrid"></div>
    <div class="sec-title">По проектам</div>
    <div class="table-wrap">
      <table class="data-table" id="projTable">
        <thead><tr>
          <th>Проект</th><th>Оценок всего</th><th>КСАТ общий</th><th>VIP</th><th>Регуляр</th>
          <th>С оператором</th><th>Бот (без опер.)</th><th>TG</th><th>Лайков</th><th>Дизлайков</th>
        </tr></thead>
        <tbody id="projBody"></tbody>
      </table>
    </div>
    <div class="sec-title">По дням</div>
    <div class="table-wrap">
      <table class="data-table" id="dayTable">
        <thead><tr>
          <th>Дата</th><th>КСАТ общий</th><th>VIP</th><th>Регуляр</th><th>С оператором</th>
          <th>Бот (без опер.)</th><th>TG</th><th>Лайков</th><th>Дизлайков</th><th>Исключ. дизл.</th>
        </tr></thead>
        <tbody id="dayBody"></tbody>
        <tfoot id="dayFoot"></tfoot>
      </table>
    </div>
  </div>
</div>
`;

export default function TLCsatPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (id: string): any => root.querySelector('#' + id);

    // ── Колонки и классификация ──
    let COL: any = {};
    let OP_COLS: any[] = [];

    function buildColMap(header: any[]) {
      COL = {}; OP_COLS = [];
      header.forEach((h, i) => {
        if (!h) return;
        const name = h.toString().trim();
        if (name === 'ID чата')                                       COL.id = i;
        else if (name === 'Дата и время начала')                      COL.date = i;
        else if (name === 'Источник')                                 COL.source = i;
        else if (name === 'Почта клиента')                            COL.email = i;
        else if (name === 'Оценка чата (CSAT)')                       COL.csat = i;
        else if (name === 'Кастом инфо о контакте: _email' || name === 'Кастом инфо о контакте: user_email') COL.customEmail = i;
        else if (name === 'Кастом инфо о контакте: phone' || name === 'Кастом инфо о контакте: user_phone')  COL.phone = i;
        else if (name === 'Кастом инфо о контакте: userId' || name === 'Кастом инфо о контакте: user_id')    COL.userId = i;
        const opMatch = name.match(/^Ник оператора (\d+)$/);
        if (opMatch) OP_COLS[parseInt(opMatch[1]) - 1] = { nick: i, dur: i + 1 };
      });
      COL.cats = [];
      header.forEach((h, i) => {
        if (h && /^Категория \d+$/.test(h.toString().trim())) COL.cats.push(i);
      });
    }

    const PROJECTS = ['Cat', 'Gama', 'Daddy', 'Mers', 'Kent', 'R7', 'Kometa', 'Arkada', 'Highroll', 'Atom', 'Motor'];

    function classifySource(src: any) {
      if (!src) return 'unknown';
      const lo = src.toString().trim().toLowerCase();
      if (lo.endsWith(' tg'))      return 'tg';
      if (lo.endsWith(' vip'))     return 'vip';
      if (lo.endsWith(' privip'))  return 'privip';
      if (lo.endsWith(' regular')) return 'regular';
      return 'unknown';
    }

    function getProject(row: any[]) {
      const src = (row[COL.source] || '').toString().trim();
      for (const p of PROJECTS) if (src.toLowerCase().includes(p.toLowerCase())) return p;
      return null;
    }

    function getCats(row: any[]) {
      const cats: string[] = [];
      for (const idx of (COL.cats || [])) {
        const v = (row[idx] || '').toString().trim();
        if (v) cats.push(v);
      }
      return cats;
    }

    const isTG      = (row: any[]) => classifySource(row[COL.source]) === 'tg';
    const isVIP     = (row: any[]) => classifySource(row[COL.source]) === 'vip';
    const isPrivip  = (row: any[]) => classifySource(row[COL.source]) === 'privip';
    const isRegular = (row: any[]) => { const t = classifySource(row[COL.source]); return t === 'regular' || t === 'tg'; };

    function hasHumanOp(row: any[]) {
      for (const { nick } of OP_COLS) if ((row[nick] || '').toString().trim()) return true;
      return false;
    }
    const isBotOnly = (row: any[]) => !hasHumanOp(row);

    const SPAM_WORDS = ['spam', 'спам', 'scam'];
    const isSpam = (row: any[]) => getCats(row).some(t => SPAM_WORDS.some(s => t.toLowerCase().includes(s)));

    // ── CSAT логика ──
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

    const getChatId  = (row: any[]) => (row[COL.id] || '').toString().trim();
    const getDateStr = (row: any[]) => (row[COL.date] || '').toString().substring(0, 10);

    function getVisitorId(row: any[]) {
      const email = (row[COL.email] || row[COL.customEmail] || '').toString().trim().toLowerCase();
      if (email) return email;
      const uid = (row[COL.userId] || '').toString().trim();
      if (uid) return uid;
      const phone = (row[COL.phone] || '').toString().trim();
      if (phone && phone !== 'None') return phone;
      return getChatId(row);
    }

    function buildCountedDislikes(allRows: any[][]) {
      const byVisitor: Record<string, any[][]> = {};
      allRows.forEach(r => {
        if (!isBadRated(r)) return;
        const vid = getVisitorId(r);
        if (!vid) return;
        if (!byVisitor[vid]) byVisitor[vid] = [];
        byVisitor[vid].push(r);
      });
      const counted = new Set<string>();
      Object.values(byVisitor).forEach(chats => {
        chats.sort((a, b) => +new Date(a[COL.date]) - +new Date(b[COL.date]));
        let lastCountedTime: number | null = null;
        chats.forEach(r => {
          const t = +new Date(r[COL.date]);
          if (lastCountedTime === null || (t - lastCountedTime) / 3600000 >= 24) {
            counted.add(getChatId(r));
            lastCountedTime = t;
          }
        });
      });
      return counted;
    }

    function calcCSAT(rows: any[][], countedDislikes: Set<string>) {
      let good = 0, total = 0, excluded = 0;
      rows.forEach(r => {
        if (!isRated(r)) return;
        if (isGoodRated(r)) { good++; total++; }
        else if (isBadRated(r)) {
          if (countedDislikes.has(getChatId(r))) { total++; }
          else { excluded++; }
        }
      });
      return { pct: total > 0 ? (good / total * 100) : null, good, total, excluded };
    }

    // ── Утилиты отображения ──
    const fmtPct = (n: number | null) => (n === null || isNaN(n as number)) ? '—' : (n as number).toFixed(1) + '%';
    function pctClass(v: number | null) {
      if (v === null) return 'pct-none';
      if (v >= 80) return 'pct-good';
      if (v >= 65) return 'pct-mid';
      return 'pct-bad';
    }
    function csatBar(v: number | null) {
      if (v === null) return '';
      const color = v >= 80 ? 'var(--accent2)' : v >= 65 ? 'var(--accent4)' : 'var(--accent3)';
      return `<div class="csat-bar"><div class="csat-bar-fill" style="width:${Math.min(v, 100)}%;background:${color}"></div></div>`;
    }
    const pctCell = (v: number | null) => `<span class="${pctClass(v)}">${fmtPct(v)}</span>`;
    const pctCellBar = (v: number | null) => `<div class="csat-bar-wrap">${csatBar(v)}<span class="${pctClass(v)}">${fmtPct(v)}</span></div>`;

    // ── Состояние ──
    let parsedData: any[][] = [];

    // ── Загрузка файла ──
    function handleFile(file: File) {
      $('fileInfo').textContent = `📄 ${file.name}`;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
          if (raw.length < 2) { alert('Файл пустой или не содержит данных'); return; }
          const header = raw[0];
          if (!header || !header[0] || header[0].toString() !== 'ID чата') {
            alert('⚠ Файл не похож на выгрузку Chatwoot. Ожидается первый столбец "ID чата".');
            return;
          }
          buildColMap(header);
          parsedData = raw.slice(1).filter(r => r && r[0] != null);

          const dates = parsedData.map(r => getDateStr(r)).filter(Boolean);
          if (dates.length) {
            const unique = [...new Set(dates)].sort();
            const fromD = unique.length > 1 ? unique[1] : unique[0];
            const toD   = unique[unique.length - 1];
            $('dateFrom').value = fromD;
            $('dateTo').value   = toD;
          }
          $('analyzeBtn').disabled = false;
          $('spamBadge').style.display = '';
          $('fileInfo').textContent += ` (${parsedData.length} строк)`;
        } catch (err: any) {
          alert('Ошибка чтения файла: ' + err.message);
          console.error(err);
        }
      };
      reader.readAsArrayBuffer(file);
    }

    // ── Основной анализ ──
    function analyze() {
      const dateFrom = $('dateFrom').value;
      const dateTo   = $('dateTo').value;
      if (!dateFrom || !dateTo) { alert('Укажи период'); return; }

      const rows = parsedData.filter(r => {
        const d = getDateStr(r);
        return d >= dateFrom && d <= dateTo;
      });
      if (!rows.length) { alert('Нет данных за выбранный период'); return; }

      const countedDislikes = buildCountedDislikes(parsedData);
      const nonSpam = rows.filter(r => !isSpam(r));

      const csatTotal   = calcCSAT(nonSpam, countedDislikes);
      const csatVIP     = calcCSAT(nonSpam.filter(isVIP), countedDislikes);
      const csatReg     = calcCSAT(nonSpam.filter(isRegular), countedDislikes);
      const csatWithOp  = calcCSAT(nonSpam.filter(hasHumanOp), countedDislikes);
      const csatBot     = calcCSAT(nonSpam.filter(isBotOnly), countedDislikes);
      const csatTG      = calcCSAT(nonSpam.filter(isTG), countedDislikes);
      const csatNoTG    = calcCSAT(nonSpam.filter(r => !isTG(r)), countedDislikes);
      const csatPrivip  = calcCSAT(nonSpam.filter(isPrivip), countedDislikes);

      const totalBadRated = nonSpam.filter(isBadRated).length;
      const totalExcluded = nonSpam.reduce((acc, r) => (isBadRated(r) && !countedDislikes.has(getChatId(r))) ? acc + 1 : acc, 0);
      const totalGoodRated = nonSpam.filter(isGoodRated).length;
      const spamRows = rows.filter(isSpam).length;

      $('periodLabel').textContent = `${dateFrom} — ${dateTo}`;

      const cards = [
        { label: 'КСАТ общий', v: csatTotal.pct, sub: `${csatTotal.good} л / ${csatTotal.total - csatTotal.good} д` },
        { label: 'КСАТ VIP', v: csatVIP.pct, sub: `${csatVIP.good} л / ${csatVIP.total - csatVIP.good} д` },
        { label: 'КСАТ Регуляр', v: csatReg.pct, sub: `${csatReg.good} л / ${csatReg.total - csatReg.good} д` },
        { label: 'КСАТ с оператором', v: csatWithOp.pct, sub: `${csatWithOp.good} л / ${csatWithOp.total - csatWithOp.good} д` },
        { label: 'КСАТ Бот (без опер.)', v: csatBot.pct, sub: `${csatBot.good} л / ${csatBot.total - csatBot.good} д` },
        { label: 'КСАТ TG', v: csatTG.pct, sub: `${csatTG.good} л / ${csatTG.total - csatTG.good} д` },
        { label: 'КСАТ Не-TG', v: csatNoTG.pct, sub: `${csatNoTG.good} л / ${csatNoTG.total - csatNoTG.good} д` },
        { label: 'КСАТ Привип', v: csatPrivip.pct, sub: `${csatPrivip.good} л / ${csatPrivip.total - csatPrivip.good} д` },
      ];
      $('summaryGrid').innerHTML = cards.map(c => {
        const cls = c.v !== null ? (c.v >= 80 ? 'green' : c.v >= 65 ? 'yellow' : 'red') : '';
        return `<div class="stat-card"><div class="stat-label">${c.label}</div><div class="stat-value ${cls}">${fmtPct(c.v)}</div><div class="stat-sub">${c.sub || ''}</div></div>`;
      }).join('');

      $('spamInfo').innerHTML = `
        <div class="spam-info-item"><div class="spam-info-label">Исключено дизлайков (спам 24ч)</div><div class="spam-info-val">${totalExcluded}</div></div>
        <div class="spam-info-item"><div class="spam-info-label">Учтённых дизлайков</div><div class="spam-info-val" style="color:var(--accent3)">${totalBadRated - totalExcluded}</div></div>
        <div class="spam-info-item"><div class="spam-info-label">Лайков учтено</div><div class="spam-info-val" style="color:var(--accent2)">${totalGoodRated}</div></div>
        <div class="spam-info-item"><div class="spam-info-label">Строк со спам-категорией</div><div class="spam-info-val">${spamRows}</div></div>
        <div class="spam-info-item"><div class="spam-info-label">Всего чатов в периоде</div><div class="spam-info-val" style="color:var(--label)">${rows.length}</div></div>`;

      function dimCardHtml(title: string, items: Array<[string, any]>) {
        return `<div class="dim-card"><div class="dim-card-title">${title}</div>${items.map(([label, res]) => `
          <div class="dim-row"><div><div class="dim-label">${label}</div>
          <div class="dim-sub">${res.good} л · ${res.total - res.good} д · исключено: ${res.excluded}</div></div>
          <div class="dim-val ${pctClass(res.pct)}">${fmtPct(res.pct)}</div></div>`).join('')}</div>`;
      }
      $('dimGrid').innerHTML = [
        dimCardHtml('VIP vs Регуляр', [['VIP', csatVIP], ['Регуляр (включая TG)', csatReg], ['Привип', csatPrivip]]),
        dimCardHtml('С оператором vs Бот', [['С оператором', csatWithOp], ['Бот без оператора', csatBot]]),
        dimCardHtml('TG vs Не-TG', [['Telegram (TG источник)', csatTG], ['Не-TG (сайт/другое)', csatNoTG]]),
        dimCardHtml('Общий КСАТ без спама', [['За весь период', csatTotal]]),
      ].join('');

      // По проектам
      const projStats: Record<string, any> = {};
      PROJECTS.forEach(p => projStats[p] = { rows: [], vip: [], reg: [], withOp: [], botOnly: [], tg: [] });
      nonSpam.forEach(r => {
        const p = getProject(r); if (!p) return;
        projStats[p].rows.push(r);
        if (isVIP(r)) projStats[p].vip.push(r);
        if (isRegular(r)) projStats[p].reg.push(r);
        if (hasHumanOp(r)) projStats[p].withOp.push(r);
        if (isBotOnly(r)) projStats[p].botOnly.push(r);
        if (isTG(r)) projStats[p].tg.push(r);
      });
      const projRows = PROJECTS.map(p => {
        const s = projStats[p];
        if (!s.rows.length) return null;
        return {
          p,
          c: calcCSAT(s.rows, countedDislikes), cv: calcCSAT(s.vip, countedDislikes),
          cr: calcCSAT(s.reg, countedDislikes), co: calcCSAT(s.withOp, countedDislikes),
          cb: calcCSAT(s.botOnly, countedDislikes), ct: calcCSAT(s.tg, countedDislikes),
        };
      }).filter(Boolean) as any[];
      $('projBody').innerHTML = projRows.map(({ p, c, cv, cr, co, cb, ct }) => `<tr>
        <td><span class="proj-name">${p}</span></td>
        <td class="num">${c.total}</td>
        <td>${pctCellBar(c.pct)}</td>
        <td>${pctCell(cv.pct)}</td>
        <td>${pctCell(cr.pct)}</td>
        <td>${pctCell(co.pct)}</td>
        <td>${pctCell(cb.pct)}</td>
        <td>${pctCell(ct.pct)}</td>
        <td class="num pct-good">${c.good}</td>
        <td class="num pct-bad">${c.total - c.good}</td>
      </tr>`).join('') || '<tr><td colspan="10" class="empty">Нет данных</td></tr>';

      // По дням
      const dates = [...new Set(rows.map(getDateStr))].sort();
      let totGood = 0, totTotal = 0, totExcl = 0, totVGood = 0, totVTotal = 0, totRGood = 0, totRTotal = 0;
      let totOGood = 0, totOTotal = 0, totBGood = 0, totBTotal = 0, totTGGood = 0, totTGTotal = 0;
      $('dayBody').innerHTML = dates.map(d => {
        const dayRows = nonSpam.filter(r => getDateStr(r) === d);
        const dc  = calcCSAT(dayRows, countedDislikes);
        const dcv = calcCSAT(dayRows.filter(isVIP), countedDislikes);
        const dcr = calcCSAT(dayRows.filter(isRegular), countedDislikes);
        const dco = calcCSAT(dayRows.filter(hasHumanOp), countedDislikes);
        const dcb = calcCSAT(dayRows.filter(isBotOnly), countedDislikes);
        const dct = calcCSAT(dayRows.filter(isTG), countedDislikes);
        totGood += dc.good; totTotal += dc.total; totExcl += dc.excluded;
        totVGood += dcv.good; totVTotal += dcv.total;
        totRGood += dcr.good; totRTotal += dcr.total;
        totOGood += dco.good; totOTotal += dco.total;
        totBGood += dcb.good; totBTotal += dcb.total;
        totTGGood += dct.good; totTGTotal += dct.total;
        return `<tr>
          <td class="num">${d}</td>
          <td>${pctCellBar(dc.pct)}</td>
          <td>${pctCell(dcv.pct)}</td>
          <td>${pctCell(dcr.pct)}</td>
          <td>${pctCell(dco.pct)}</td>
          <td>${pctCell(dcb.pct)}</td>
          <td>${pctCell(dct.pct)}</td>
          <td class="num pct-good">${dc.good}</td>
          <td class="num pct-bad">${dc.total - dc.good}</td>
          <td class="num" style="color:var(--muted)">${dc.excluded}</td>
        </tr>`;
      }).join('');

      const safePct = (good: number, total: number) => total > 0 ? (good / total * 100) : null;
      $('dayFoot').innerHTML = `<tr class="total-row">
        <td><strong>ИТОГО</strong></td>
        <td>${pctCellBar(safePct(totGood, totTotal))}</td>
        <td>${pctCell(safePct(totVGood, totVTotal))}</td>
        <td>${pctCell(safePct(totRGood, totRTotal))}</td>
        <td>${pctCell(safePct(totOGood, totOTotal))}</td>
        <td>${pctCell(safePct(totBGood, totBTotal))}</td>
        <td>${pctCell(safePct(totTGGood, totTGTotal))}</td>
        <td class="num pct-good">${totGood}</td>
        <td class="num pct-bad">${totTotal - totGood}</td>
        <td class="num" style="color:var(--muted)">${totExcl}</td>
      </tr>`;

      $('results').classList.add('show');
      $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── Слушатели ──
    const dropZone = $('dropZone');
    const fileInput = $('fileInput');
    const analyzeBtn = $('analyzeBtn');
    const onDragOver = (e: Event) => { e.preventDefault(); dropZone.classList.add('drag'); };
    const onDragLeave = () => dropZone.classList.remove('drag');
    const onDrop = (e: any) => { e.preventDefault(); dropZone.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };
    const onChange = (e: any) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
    const onAnalyze = () => analyze();
    dropZone?.addEventListener('dragover', onDragOver);
    dropZone?.addEventListener('dragleave', onDragLeave);
    dropZone?.addEventListener('drop', onDrop);
    fileInput?.addEventListener('change', onChange);
    analyzeBtn?.addEventListener('click', onAnalyze);

    return () => {
      dropZone?.removeEventListener('dragover', onDragOver);
      dropZone?.removeEventListener('dragleave', onDragLeave);
      dropZone?.removeEventListener('drop', onDrop);
      fileInput?.removeEventListener('change', onChange);
      analyzeBtn?.removeEventListener('click', onAnalyze);
    };
  }, []);

  return (
    <div className="tlcsat" ref={rootRef}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Unbounded:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{CSS}</style>
      <BackButton to="/tl" />
      <div dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
    </div>
  );
}
