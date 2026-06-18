import { useEffect, useRef } from 'react';
import BackButton from '@/components/BackButton';

// Payment Stats — port of ops/payment_report/index.html
// CSV upload, period comparison (hourly bar + line), multi-day trend.
// Chart.js is loaded from CDN on demand. Original is a self-contained imperative
// DOM app preserved inside a scoped effect.

/* eslint-disable @typescript-eslint/no-explicit-any */

const BODY_HTML = `
<div class="app">
  <h1>📊 Payment Stats</h1>
  <label class="upload-zone" id="dropzone" for="fileInput">
    <input type="file" id="fileInput" accept=".csv">
    <div class="upload-icon">📁</div>
    <div>Перетащи CSV-файл или <b>выбери вручную</b></div>
    <div class="upload-label">Определяет источник автоматически (SupportCIS / NK) · Время приводится к UTC</div>
    <div class="file-name" id="fileName"></div>
  </label>
  <div id="detectedSource" style="display:none;font-size:12px;color:#378ADD;margin-bottom:12px;font-weight:500;"></div>
  <div class="controls">
    <div class="ctrl-group"><label>Период 1 (база) — от</label><input type="date" id="d1from"></div>
    <div class="ctrl-group"><label>до</label><input type="date" id="d1to"></div>
    <div style="display:flex;align-items:flex-end;padding-bottom:2px;color:#bbb;font-size:18px;">vs</div>
    <div class="ctrl-group"><label>Период 2 (сравнение) — от</label><input type="date" id="d2from"></div>
    <div class="ctrl-group"><label>до</label><input type="date" id="d2to"></div>
    <button class="btn" id="buildBtn" disabled>Построить</button>
    <button class="btn btn-sec" id="resetBtn" style="display:none">Сбросить</button>
  </div>
  <div id="output"></div>
</div>
`;

const CSS = `
.ops-payment{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f3;color:#2C2C2A;font-size:14px;min-height:100vh;}
.ops-payment *,.ops-payment *::before,.ops-payment *::after{box-sizing:border-box;}
.ops-payment .app{max-width:1100px;margin:0 auto;padding:24px 16px;}
.ops-payment h1{font-size:20px;font-weight:600;margin-bottom:20px;}
.ops-payment .upload-zone{display:block;border:2px dashed #ccc;border-radius:10px;padding:32px;text-align:center;cursor:pointer;background:#fff;transition:border-color .2s;margin-bottom:20px;}
.ops-payment .upload-zone:hover,.ops-payment .upload-zone.drag{border-color:#378ADD;background:#f0f7ff;}
.ops-payment .upload-zone input{display:none;}
.ops-payment .upload-icon{font-size:36px;margin-bottom:8px;}
.ops-payment .upload-label{color:#555;font-size:13px;margin-top:6px;}
.ops-payment .upload-label b{color:#378ADD;cursor:pointer;}
.ops-payment .file-name{margin-top:8px;font-size:12px;color:#888;}
.ops-payment .controls{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px;}
.ops-payment .ctrl-group{display:flex;flex-direction:column;gap:4px;}
.ops-payment .ctrl-group label{font-size:11px;color:#888;}
.ops-payment .ctrl-group input[type=date]{padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;background:#fff;}
.ops-payment .btn{padding:8px 20px;background:#378ADD;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;}
.ops-payment .btn:hover{background:#2a6db0;}
.ops-payment .btn:disabled{background:#aaa;cursor:not-allowed;}
.ops-payment .btn-sec{background:#fff;color:#378ADD;border:1px solid #378ADD;}
.ops-payment .btn-sec:hover{background:#f0f7ff;}
.ops-payment .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:24px;}
.ops-payment .scard{background:#fff;border-radius:8px;border:0.5px solid #e0e0dc;padding:12px 14px;}
.ops-payment .scard-label{font-size:11px;color:#888;margin-bottom:4px;}
.ops-payment .scard-val{font-size:22px;font-weight:600;}
.ops-payment .scard-sub{font-size:11px;margin-top:3px;}
.ops-payment .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;}
.ops-payment .tab{padding:5px 14px;border-radius:6px;border:0.5px solid #ccc;cursor:pointer;font-size:12px;background:#fff;color:#666;transition:all .15s;}
.ops-payment .tab:hover{border-color:#378ADD;color:#378ADD;}
.ops-payment .tab.active{background:#378ADD;color:#fff;border-color:#378ADD;font-weight:500;}
.ops-payment .tab.extra{border-style:dashed;}
.ops-payment .tab.extra.active{background:#888;border-color:#888;}
.ops-payment .seg-tab{padding:4px 12px;border-radius:6px;border:0.5px solid #ccc;cursor:pointer;font-size:11px;background:#fff;color:#666;}
.ops-payment .seg-tab:hover{border-color:#1D9E75;color:#1D9E75;}
.ops-payment .seg-tab.active{background:#1D9E75;color:#fff;border-color:#1D9E75;font-weight:500;}
.ops-payment .panel{background:#fff;border-radius:10px;border:0.5px solid #e0e0dc;padding:16px 20px;}
.ops-payment .brand-header{display:flex;align-items:baseline;gap:12px;margin-bottom:12px;flex-wrap:wrap;}
.ops-payment .brand-name{font-size:15px;font-weight:600;}
.ops-payment .brand-meta{font-size:12px;color:#888;}
.ops-payment .brand-diff{font-size:13px;font-weight:600;}
.ops-payment .legend{display:flex;gap:16px;margin-bottom:10px;font-size:12px;color:#888;}
.ops-payment .lbox{width:10px;height:10px;border-radius:2px;display:inline-block;margin-right:4px;vertical-align:middle;}
.ops-payment .chart-wrap{position:relative;width:100%;height:220px;margin-bottom:16px;}
.ops-payment table{width:100%;border-collapse:collapse;font-size:12px;}
.ops-payment th{text-align:left;color:#888;font-weight:400;padding:5px 8px;border-bottom:0.5px solid #e8e8e4;font-size:11px;}
.ops-payment th.r{text-align:right;}
.ops-payment td{padding:4px 8px;border-bottom:0.5px solid #f0f0ec;}
.ops-payment td.r{text-align:right;}
.ops-payment td.muted{color:#888;}
.ops-payment .up{color:#27AE60;} .ops-payment .dn{color:#C0392B;}
.ops-payment tr.bg-up td{background:#EAF7EF;}
.ops-payment tr.bg-dn td{background:#FDECEA;}
.ops-payment tr.bg-neu td{background:#fafaf8;}
.ops-payment tr.footer td{font-weight:600;border-top:1px solid #ddd;}
.ops-payment tr.footer.bg-up td{background:#d4f0df;}
.ops-payment tr.footer.bg-dn td{background:#fad4d0;}
.ops-payment .empty{text-align:center;padding:60px;color:#aaa;font-size:14px;}
.ops-payment .mode-btn{padding:4px 12px;border-radius:6px;border:0.5px solid #ccc;background:#fff;font-size:12px;cursor:pointer;color:#666;}
.ops-payment .mode-btn:hover{border-color:#378ADD;color:#378ADD;}
.ops-payment .mode-btn.active{background:#378ADD;color:#fff;border-color:#378ADD;font-weight:500;}
.ops-payment .sep{border:none;border-top:1px dashed #e0e0dc;margin:16px 0;}
`;

function loadChartJs(): Promise<any> {
  if ((window as any).Chart) return Promise.resolve((window as any).Chart);
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('chartjs-cdn');
    if (existing) { existing.addEventListener('load', () => resolve((window as any).Chart)); return; }
    const s = document.createElement('script');
    s.id = 'chartjs-cdn';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    s.onload = () => resolve((window as any).Chart);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function OpsPayment() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;

    loadChartJs().then((Chart) => {
      if (disposed) return;
      run(root, Chart);
    });

    return () => { disposed = true; };
  }, []);

  return (
    <div className="ops-payment" ref={rootRef}>
      <style>{CSS}</style>
      <BackButton to="/ops" />
      <div dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
    </div>
  );
}

interface HourData { y: number[]; t: number[] }

function run(root: HTMLElement, Chart: any) {
  const $ = (id: string) => root.querySelector('#' + id) as HTMLElement | null;

  const BLUE = '#378ADD', GREEN_BAR = '#1D9E75', COL_UP = '#27AE60', COL_DN = '#C0392B', GRAY = '#888';

  let csvData: Record<string, string>[] = [];
  let activeChart: any = null;
  let activeSource: 'cis' | 'nk' = 'cis';
  let hourlyChart: any = null;
  let edgeDates = new Set<string>();
  let fullDaysForTrend: string[] = [];
  let byDateBrandG: Record<string, Record<string, number>> = {};
  let byDateAllG: Record<string, number> = {};
  let cutHourG = 24;
  let activeBrandG = '__all__';

  const SOURCE_CONFIG: Record<string, { label: string; isPayment: (t: string) => boolean; getBrand: (t: string) => string | null; brandOrder: string[] }> = {
    cis: {
      label: 'SupportCIS',
      isPayment: (team) => team.includes('Payment'),
      getBrand: (team) => { for (const b of ['Arkada', 'Cat', 'Daddy', 'Gama', 'Kent', 'Kometa', 'Mers', 'R7']) { if (team.includes(b)) return b; } return null; },
      brandOrder: ['Cat', 'Gama', 'Kent', 'R7', 'Daddy', 'Kometa', 'Arkada', 'Mers'],
    },
    nk: {
      label: 'NK',
      isPayment: (team) => team.includes('Payment'),
      getBrand: (team) => { if (team.includes('Atom')) return 'Atom'; if (team.includes('Motor')) return 'Motor'; return null; },
      brandOrder: ['Atom', 'Motor'],
    },
  };

  const dropzone = $('dropzone')!;
  const fileInput = $('fileInput') as HTMLInputElement;
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('drag'); loadFile((e as DragEvent).dataTransfer!.files[0]); });
  fileInput.addEventListener('change', (e) => loadFile((e.target as HTMLInputElement).files![0]));
  $('buildBtn')!.addEventListener('click', buildStats);
  $('resetBtn')!.addEventListener('click', resetDates);

  function detectSource(rows: Record<string, string>[]): 'cis' | 'nk' {
    const sample = rows.slice(0, 30).map((r) => (r.teamName || '').trim());
    const hasNK = sample.some((t) => t.includes('Atom') || t.includes('Motor'));
    return hasNK ? 'nk' : 'cis';
  }
  function loadFile(file: File) {
    if (!file) return;
    $('fileName')!.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      csvData = parseCSV(String(e.target!.result));
      activeSource = detectSource(csvData);
      const label = SOURCE_CONFIG[activeSource].label;
      $('detectedSource')!.textContent = 'Источник: ' + label;
      $('detectedSource')!.style.display = '';
      prefillDates();
      ($('buildBtn') as HTMLButtonElement).disabled = false;
    };
    reader.readAsText(file, 'utf-8');
  }
  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split('\n');
    const headers = parseCSVLine(lines[0]);
    return lines.slice(1).map((line) => {
      const vals = parseCSVLine(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h.replace(/"/g, '')] = (vals[i] || '').replace(/"/g, ''); });
      return obj;
    }).filter((r) => r.createdAt);
  }
  function parseCSVLine(line: string): string[] {
    const result: string[] = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQ = !inQ;
      else if (line[i] === ',' && !inQ) { result.push(cur); cur = ''; }
      else cur += line[i];
    }
    result.push(cur);
    return result;
  }
  function toUTCDateStr(isoStr: string): string {
    const d = new Date(isoStr);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function toUTCHour(isoStr: string): number { return new Date(isoStr).getUTCHours(); }

  function prefillDates() {
    const dates = [...new Set(csvData.map((r) => toUTCDateStr(r.createdAt)))].sort();
    edgeDates = new Set([dates[0], dates[dates.length - 1]]);
    const fullDays = dates.filter((d) => !edgeDates.has(d));
    const p1 = fullDays.length >= 1 ? fullDays[0] : dates[0];
    const p2 = fullDays.length >= 2 ? fullDays[fullDays.length - 1] : dates[dates.length - 1];
    ($('d1from') as HTMLInputElement).value = p1;
    ($('d1to') as HTMLInputElement).value = p1;
    ($('d2from') as HTMLInputElement).value = p2;
    ($('d2to') as HTMLInputElement).value = p2;
  }
  function resetDates() { prefillDates(); buildStats(); }
  function getDateRange(fromId: string, toId: string): string[] {
    const from = ($(fromId) as HTMLInputElement).value;
    const to = ($(toId) as HTMLInputElement).value;
    const result: string[] = [];
    let cur = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    while (cur <= end) { result.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1); }
    return result;
  }

  function buildStats() {
    const d1from = ($('d1from') as HTMLInputElement).value, d1to = ($('d1to') as HTMLInputElement).value;
    const d2from = ($('d2from') as HTMLInputElement).value, d2to = ($('d2to') as HTMLInputElement).value;
    if (!d1from || !d1to || !d2from || !d2to || !csvData.length) return;
    $('resetBtn')!.style.display = '';

    const p1dates = new Set(getDateRange('d1from', 'd1to'));
    const p2dates = new Set(getDateRange('d2from', 'd2to'));
    const d1 = d1from === d1to ? d1from : d1from + '→' + d1to;
    const d2 = d2from === d2to ? d2from : d2from + '→' + d2to;

    const byTeam: Record<string, HourData> = {};
    const addRow = (key: string, hour: number, isD1: boolean) => {
      if (!byTeam[key]) byTeam[key] = { y: Array(24).fill(0), t: Array(24).fill(0) };
      if (isD1) byTeam[key].y[hour]++; else byTeam[key].t[hour]++;
    };

    const byDateBrand: Record<string, Record<string, number>> = {};
    const byDateAll: Record<string, number> = {};
    const allDatesInFile = [...new Set(csvData.map((r) => toUTCDateStr(r.createdAt)))].sort();
    const fullDays = allDatesInFile.filter((d) => !edgeDates.has(d));

    const cfg = SOURCE_CONFIG[activeSource];
    csvData.forEach((row) => {
      const team = (row.teamName || '').trim();
      if (!cfg.isPayment(team)) return;
      const date = toUTCDateStr(row.createdAt);
      const hour = toUTCHour(row.createdAt);
      if (!edgeDates.has(date)) {
        if (!byDateAll[date]) byDateAll[date] = 0;
        byDateAll[date]++;
        const brand = cfg.getBrand(team);
        if (brand) { if (!byDateBrand[date]) byDateBrand[date] = {}; if (!byDateBrand[date][brand]) byDateBrand[date][brand] = 0; byDateBrand[date][brand]++; }
      }
      if (!p1dates.has(date) && !p2dates.has(date)) return;
      addRow(team, hour, p1dates.has(date));
    });

    const allT = Array(24).fill(0);
    Object.values(byTeam).forEach((g) => g.t.forEach((v, i) => { allT[i] += v; }));
    const today = toUTCDateStr(new Date().toISOString());
    const p2IsPartial = edgeDates.has(d2to) || d2to === today;
    let cutHour = 24;
    if (p2IsPartial) { for (let h = 23; h >= 0; h--) { if (allT[h] > 0) { cutHour = h; break; } } }

    const brandOrder = cfg.brandOrder;
    const emptyGroup = (): HourData => ({ y: Array(24).fill(0), t: Array(24).fill(0) });
    const mergeInto = (target: HourData, src: HourData) => { target.y = target.y.map((v, i) => v + src.y[i]); target.t = target.t.map((v, i) => v + src.t[i]); };

    const byBrand: Record<string, { regular: HourData; vip: HourData; all: HourData }> = {};
    const byExtra: Record<string, HourData> = {};
    Object.entries(byTeam).forEach(([team, data]) => {
      const brand = cfg.getBrand(team);
      const isVip = /vip/i.test(team);
      const seg = isVip ? 'vip' : 'regular';
      if (brand) {
        if (!byBrand[brand]) byBrand[brand] = { regular: emptyGroup(), vip: emptyGroup(), all: emptyGroup() };
        mergeInto((byBrand[brand] as any)[seg], data);
        mergeInto(byBrand[brand].all, data);
      } else {
        if (!byExtra[team]) byExtra[team] = emptyGroup();
        mergeInto(byExtra[team], data);
      }
    });

    const fmt = (d: string) => d.includes('→')
      ? d.split('→').map((s) => s.split('-').reverse().join('.')).join(' → ')
      : d.split('-').reverse().join('.');
    const brandCount = Object.keys(byBrand).length;

    let totalYday = 0, totalYtime = 0, totalT = 0;
    Object.values(byBrand).forEach((b) => {
      b.all.y.forEach((v, h) => { totalYday += v; if (h < cutHour) totalYtime += v; });
      b.all.t.forEach((v, h) => { if (h < cutHour) totalT += v; });
    });
    Object.values(byExtra).forEach((b) => {
      b.y.forEach((v, h) => { totalYday += v; if (h < cutHour) totalYtime += v; });
      b.t.forEach((v, h) => { if (h < cutHour) totalT += v; });
    });

    let compareMode: 'day' | 'time' = 'time';

    const allData: HourData = { y: Array(24).fill(0), t: Array(24).fill(0) };
    Object.values(byBrand).forEach((b) => { b.all.y.forEach((v, i) => { allData.y[i] += v; }); b.all.t.forEach((v, i) => { allData.t[i] += v; }); });
    Object.values(byExtra).forEach((b) => { b.y.forEach((v, i) => { allData.y[i] += v; }); b.t.forEach((v, i) => { allData.t[i] += v; }); });

    const calcPct = (data: HourData) => {
      const gy = compareMode === 'day' ? data.y.reduce((a, b) => a + b, 0) : data.y.slice(0, cutHour).reduce((a, b) => a + b, 0);
      const gt = data.t.slice(0, cutHour).reduce((a, b) => a + b, 0);
      const gd = gt - gy;
      const gpct = gy ? Math.round((gd / gy) * 100) : null;
      return { gd, gpct };
    };

    const tabBtnMap: Record<string, HTMLElement> = {};
    const rebuildTabLabels = () => {
      Object.entries(tabBtnMap).forEach(([g, btn]) => {
        const isExtra = !byBrand[g] && g !== '__all__';
        const data = g === '__all__' ? allData : (isExtra ? byExtra[g] : byBrand[g].all);
        const { gd, gpct } = calcPct(data);
        const gc = gd > 0 ? COL_UP : (gd < 0 ? COL_DN : GRAY);
        const pctStr = gpct !== null ? (gpct > 0 ? '+' : '') + gpct + '%' : '–';
        const name = g === '__all__' ? 'Все' : g;
        btn.innerHTML = `${name} <span style="color:${gc};font-size:11px">${pctStr}</span>`;
      });
    };

    const renderSummary = () => {
      const totalY = compareMode === 'day' ? totalYday : totalYtime;
      const totalD = totalT - totalY;
      const totalPct = totalY ? Math.round((totalD / totalY) * 100) : 0;
      const dSign = totalD >= 0 ? '+' : '';
      const dCol = totalD > 0 ? COL_UP : COL_DN;
      const isD1Edge = edgeDates.has(d1);
      const edgeWarn = compareMode === 'day' && isD1Edge ? ' ⚠️' : '';
      const d1label = compareMode === 'day' ? `${fmt(d1)} (весь день${edgeWarn})` : `${fmt(d1)} (00–${(cutHour - 1).toString().padStart(2, '0')})`;
      $('card-y')!.innerHTML = `<div class="scard-label">Тикетов ${d1label}</div><div class="scard-val">${totalY}</div>`;
      const d2timeLabel = cutHour < 24 ? ` (00–${(cutHour - 1).toString().padStart(2, '0')})` : '';
      $('card-t')!.innerHTML = `<div class="scard-label">Тикетов ${fmt(d2)}${d2timeLabel}</div><div class="scard-val">${totalT}</div>`;
      $('card-d')!.innerHTML = `<div class="scard-label">Разница</div><div class="scard-val" style="color:${dCol}">${dSign}${totalD}</div>`;
      $('card-pct')!.innerHTML = `<div class="scard-label">Изменение</div><div class="scard-val" style="color:${dCol}">${dSign}${totalPct}%</div>`;
      rebuildTabLabels();
    };

    const html = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:12px;color:#888;">Сравнение:</span>
        <button class="mode-btn active" id="modeTime">${cutHour < 24 ? 'По времени (00–' + (cutHour - 1).toString().padStart(2, '0') + ')' : 'По времени (полный день)'}</button>
        <button class="mode-btn" id="modeDay">За весь день d1</button>
      </div>
      <div class="summary">
        <div class="scard" id="card-y"></div>
        <div class="scard" id="card-t"></div>
        <div class="scard" id="card-d"></div>
        <div class="scard" id="card-pct"></div>
        <div class="scard"><div class="scard-label">Брендов</div><div class="scard-val">${brandCount}</div></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div class="tabs" id="tabs" style="margin-bottom:0;flex:1;"></div>
        <button class="mode-btn" id="trendBtn" style="margin-left:12px;white-space:nowrap;">📈 Тренд</button>
      </div>
      <div class="tabs extra-tabs" id="extraTabs" style="margin-bottom:8px;"></div>
      <div class="seg-tabs" id="segTabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;"></div>
      <div class="panel" id="panel"><div class="empty">Выбери бренд выше</div></div>
    `;
    $('output')!.innerHTML = html;

    const tabsEl = $('tabs')!, segTabsEl = $('segTabs')!, extraTabsEl = $('extraTabs')!;
    let activeBrand = '__all__'; activeBrandG = '__all__';
    let activeSeg: 'all' | 'regular' | 'vip' = 'all';

    $('modeTime')!.addEventListener('click', () => setMode('time', $('modeTime')!));
    $('modeDay')!.addEventListener('click', () => setMode('day', $('modeDay')!));
    $('trendBtn')!.addEventListener('click', showTrend);

    function setMode(mode: 'day' | 'time', btn: HTMLElement) {
      compareMode = mode;
      root!.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderSummary();
      if (activeBrand) renderSeg();
    }

    const renderSeg = () => {
      if (!activeBrand) return;
      $('trendBtn')?.classList.remove('active');
      if (activeBrand === '__all__') { renderPanel('Все проекты', allData, d1, d2, cutHour, fmt, compareMode); return; }
      const isExtra = !byBrand[activeBrand];
      const data = isExtra ? byExtra[activeBrand] : (byBrand[activeBrand] as any)[activeSeg];
      const label = activeBrand + (activeSeg === 'vip' ? ' — VIP' : activeSeg === 'regular' ? ' — Regular' : '');
      renderPanel(label, data, d1, d2, cutHour, fmt, compareMode);
    };

    const buildSegTabs = (brand: string) => {
      segTabsEl.innerHTML = '';
      if (!byBrand[brand]) return;
      const hasVip = byBrand[brand].vip.y.some((v) => v > 0) || byBrand[brand].vip.t.some((v) => v > 0);
      if (!hasVip) return;
      ([['all', 'Все'], ['regular', 'Regular'], ['vip', 'VIP']] as const).forEach(([seg, label]) => {
        const b = document.createElement('button');
        b.className = 'seg-tab' + (seg === activeSeg ? ' active' : '');
        b.textContent = label;
        b.onclick = () => { activeSeg = seg; segTabsEl.querySelectorAll('.seg-tab').forEach((t) => t.classList.remove('active')); b.classList.add('active'); renderSeg(); };
        segTabsEl.appendChild(b);
      });
    };

    const orderedBrands = [...brandOrder.filter((b) => byBrand[b]), ...Object.keys(byBrand).filter((b) => !brandOrder.includes(b))];
    const extraKeys = Object.keys(byExtra);

    const makeTab = (g: string, targetEl: HTMLElement, isExtra: boolean) => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (isExtra ? ' extra' : '');
      tabBtnMap[g] = btn;
      btn.onclick = () => {
        tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        extraTabsEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        btn.classList.add('active');
        activeBrand = g; activeBrandG = g; activeSeg = 'all';
        const trendActive = $('trendBtn')?.classList.contains('active');
        if (trendActive) renderTrend(activeBrandG);
        else { buildSegTabs(g); renderSeg(); }
      };
      targetEl.appendChild(btn);
      return btn;
    };

    const allBtn = document.createElement('button');
    allBtn.className = 'tab active';
    tabBtnMap['__all__'] = allBtn;
    allBtn.onclick = () => {
      tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      extraTabsEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      allBtn.classList.add('active');
      activeBrand = '__all__'; activeBrandG = '__all__'; activeSeg = 'all';
      segTabsEl.innerHTML = '';
      const trendActiveAll = $('trendBtn')?.classList.contains('active');
      if (trendActiveAll) renderTrend(activeBrandG);
      else renderPanel('Все проекты', allData, d1, d2, cutHour, fmt, compareMode);
    };
    tabsEl.appendChild(allBtn);

    orderedBrands.forEach((g) => makeTab(g, tabsEl, false));
    extraKeys.forEach((g) => makeTab(g, extraTabsEl, true));

    fullDaysForTrend = fullDays;
    byDateBrandG = byDateBrand;
    byDateAllG = byDateAll;
    cutHourG = cutHour;

    renderSummary();
    if (orderedBrands.length > 0 || extraKeys.length > 0) renderPanel('Все проекты', allData, d1, d2, cutHour, fmt, compareMode);

    function showTrend() {
      root!.querySelectorAll('#tabs .tab, #extraTabs .tab').forEach((t) => t.classList.remove('active'));
      $('trendBtn')!.classList.add('active');
      segTabsEl.innerHTML = '';
      renderTrend(activeBrandG);
    }
  }

  function renderPanel(name: string, data: HourData, d1: string, d2: string, cutHour: number, fmt: (d: string) => string, mode: 'day' | 'time') {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const yArr = hours.map((h) => data.y[h]);
    const tArr = hours.map((h) => (h < cutHour ? data.t[h] : null));

    const totY = mode === 'day' ? yArr.reduce((a, b) => a + b, 0) : yArr.slice(0, cutHour).reduce((a, b) => a + b, 0);
    const totT = tArr.slice(0, cutHour).reduce((a: number, b) => a + (b || 0), 0);
    const totD = totT - totY;
    const totPct = totY ? Math.round((totD / totY) * 100) : 0;
    const sign = totD >= 0 ? '+' : '';
    const dCol = totD > 0 ? COL_UP : COL_DN;

    let tableRows = '';
    hours.forEach((h) => {
      const msk = ((h + 3) % 24).toString().padStart(2, '0') + ':00';
      const yv = data.y[h];
      const hasTodayData = h < cutHour;
      const tv = hasTodayData ? data.t[h] : null;
      if (tv === null) {
        tableRows += `<tr class="bg-neu"><td class="muted">${h.toString().padStart(2, '0')}:00 <span style="color:#bbb;font-size:10px">${msk}</span></td><td class="r">${yv || '–'}</td><td class="r muted">–</td><td class="r muted">–</td><td class="r muted">–</td></tr>`;
        return;
      }
      const diff = tv - yv;
      const pct = yv ? Math.round((diff / yv) * 100) : null;
      const diffStr = (diff > 0 ? '+' : '') + diff;
      const pctStr = pct !== null ? (pct > 0 ? '+' : '') + pct + '%' : (tv > 0 ? 'new' : '–');
      const cls = diff > 0 ? 'up' : (diff < 0 ? 'dn' : '');
      const bgCls = diff > 0 ? 'bg-up' : (diff < 0 ? 'bg-dn' : 'bg-neu');
      tableRows += `<tr class="${bgCls}"><td class="muted">${h.toString().padStart(2, '0')}:00 <span style="color:#bbb;font-size:10px">${msk}</span></td><td class="r">${yv}</td><td class="r">${tv}</td><td class="r ${cls}">${diffStr}</td><td class="r ${cls}">${pctStr}</td></tr>`;
    });

    const footBg = totD > 0 ? 'bg-up' : 'bg-dn';
    $('panel')!.innerHTML = `
      <div class="brand-header">
        <span class="brand-name">${name}</span>
        <span class="brand-meta">${fmt(d1)}: ${totY} &nbsp;→&nbsp; ${fmt(d2)}: ${totT}</span>
        <span class="brand-diff" style="color:${dCol}">${sign}${totD} (${sign}${totPct}%)</span>
      </div>
      <div class="legend">
        <span><span class="lbox" style="background:${BLUE}"></span>${fmt(d1)}</span>
        <span><span class="lbox" style="background:${GREEN_BAR}"></span>${fmt(d2)}</span>
      </div>
      <div class="chart-wrap"><canvas id="brandChart" role="img" aria-label="График ${name}"></canvas></div>
      <table>
        <thead><tr><th>UTC <span style="color:#bbb;font-size:10px">МСК</span></th><th class="r">${fmt(d1)}</th><th class="r">${fmt(d2)}</th><th class="r">Разница</th><th class="r">%</th></tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot><tr class="footer ${footBg}"><td>Итого</td><td class="r">${totY}</td><td class="r">${totT}</td><td class="r ${totD > 0 ? 'up' : 'dn'}">${sign}${totD}</td><td class="r ${totD > 0 ? 'up' : 'dn'}">${sign}${totPct}%</td></tr></tfoot>
      </table>
      <div style="margin-top:20px;">
        <div class="legend">
          <span><span class="lbox" style="background:${BLUE}"></span>${fmt(d1)}</span>
          <span><span class="lbox" style="background:${GREEN_BAR}"></span>${fmt(d2)}</span>
        </div>
        <div style="position:relative;width:100%;height:220px;"><canvas id="hourlyChart" role="img" aria-label="Сравнение по часам ${name}"></canvas></div>
      </div>
    `;

    if (activeChart) { activeChart.destroy(); activeChart = null; }
    const hlabels = hours.map((h) => h.toString().padStart(2, '0') + ':00');
    activeChart = new Chart($('brandChart'), {
      type: 'bar',
      data: { labels: hlabels, datasets: [
        { label: fmt(d1), data: yArr, backgroundColor: BLUE, borderRadius: 3 },
        { label: fmt(d2), data: tArr, backgroundColor: GREEN_BAR, borderRadius: 3 },
      ] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { afterBody: (items: any) => {
          const i = items[0].dataIndex; const yv = yArr[i]; const tv = tArr[i];
          if (tv === null) return ['Данных ещё нет'];
          const diff = tv - yv; const pct = yv ? Math.round((diff / yv) * 100) : null;
          return pct !== null ? [`Разница: ${diff > 0 ? '+' : ''}${diff} (${pct > 0 ? '+' : ''}${pct}%)`] : [];
        } } } },
        scales: { x: { ticks: { autoSkip: false, maxRotation: 45, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { font: { size: 10 } }, grid: { color: '#f0f0ec' } } },
      },
    });

    setTimeout(() => {
      if (hourlyChart && typeof hourlyChart.destroy === 'function') hourlyChart.destroy();
      hourlyChart = null;
      const hourlyEl = $('hourlyChart');
      if (!hourlyEl) return;
      hourlyChart = new Chart(hourlyEl, {
        type: 'line',
        data: { labels: hlabels, datasets: [
          { label: fmt(d1), data: yArr, borderColor: BLUE, backgroundColor: BLUE + '22', borderWidth: 2, pointRadius: 3, pointBackgroundColor: BLUE, fill: true, tension: 0.3 },
          { label: fmt(d2), data: tArr, borderColor: GREEN_BAR, backgroundColor: GREEN_BAR + '22', borderWidth: 2, pointRadius: 3, pointBackgroundColor: GREEN_BAR, fill: true, tension: 0.3, spanGaps: false },
        ] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { afterBody: (items: any) => {
            const i = items[0].dataIndex; const yv = yArr[i], tv = tArr[i];
            if (tv === null) return ['Данных ещё нет'];
            const diff = tv - yv; const pct = yv ? Math.round((diff / yv) * 100) : null;
            return pct !== null ? [`Разница: ${diff > 0 ? '+' : ''}${diff} (${pct > 0 ? '+' : ''}${pct}%)`] : [];
          } } } },
          scales: { x: { ticks: { autoSkip: false, maxRotation: 45, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { font: { size: 10 } }, grid: { color: '#f0f0ec' }, beginAtZero: true } },
        },
      });
    }, 0);
  }

  function renderTrend(brand: string) {
    const dates = fullDaysForTrend || [];
    const byDateBrand = byDateBrandG, byDateAll = byDateAllG;
    void cutHourG;
    if (!dates.length) { $('panel')!.innerHTML = '<div class="empty">Нет полных дней для тренда</div>'; return; }
    const isPartialLast = false;

    let series: { label: string; color: string; data: number[] }[] = [];
    if (!brand || brand === '__all__') series = [{ label: 'Все проекты', color: BLUE, data: dates.map((d) => byDateAll[d] || 0) }];
    else series = [{ label: brand, color: BLUE, data: dates.map((d) => (byDateBrand[d] && byDateBrand[d][brand]) || 0) }];

    const fmtDate = (d: string) => d.split('-').reverse().slice(0, 2).join('.');
    $('panel')!.innerHTML = `
      <div class="brand-header">
        <span class="brand-name">Тренд — ${brand && brand !== '__all__' ? brand : 'Все проекты'}</span>
        <span class="brand-meta" style="font-size:11px;color:#aaa;">${isPartialLast ? '* последний день неполный' : ''}</span>
      </div>
      <div style="position:relative;width:100%;height:280px;"><canvas id="trendChart" role="img" aria-label="Тренд по дням"></canvas></div>
      <table style="margin-top:12px;">
        <thead><tr><th>Дата</th>${series.map((s) => `<th class="r">${s.label}</th>`).join('')}</tr></thead>
        <tbody>${dates.map((d, i) => `<tr><td class="muted">${fmtDate(d)}</td>${series.map((s) => `<td class="r">${s.data[i]}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    `;

    if (activeChart) { activeChart.destroy(); activeChart = null; }
    const datasets = series.map((s) => ({ label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color + '22', borderWidth: 2, pointRadius: 4, pointBackgroundColor: s.color, fill: true, tension: 0.3 }));
    activeChart = new Chart($('trendChart'), {
      type: 'line',
      data: { labels: dates.map(fmtDate), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: series.length > 1, position: 'top', labels: { font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } },
        scales: { x: { ticks: { font: { size: 11 } }, grid: { display: false } }, y: { ticks: { font: { size: 11 } }, grid: { color: '#f0f0ec' }, beginAtZero: true } },
      },
    });
  }
}
