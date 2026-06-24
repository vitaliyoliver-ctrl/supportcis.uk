import { useEffect, useRef } from 'react';
import BackButton from '@/components/BackButton';

// Зал славы поддержки — port of support/champions/index.html
// Static championship leaderboard (Dec 2025 – Apr 2026) with month tabs and a
// champion-score calculator. Content is static; tab/calc behaviour runs in a
// scoped effect (inline handlers from the original replaced with data attrs).

const CSS = `
.champions{--gold:#FFD700;--gold-dark:#C5A000;--silver:#C0C0C0;--bronze:#CD7F32;--bg-deep:#0a0c10;--bg-card:#111318;--bg-row:#15181f;--bg-row-alt:#191c24;--text-primary:#e8eaf0;--text-muted:#9ca3b0;--accent-cyan:#4f8ef7;--accent-purple:#34d399;--accent-pink:#f59e42;--accent-green:#34d399;--accent-red:#EF4444;--glow-gold:rgba(255,215,0,0.25);--glow-cyan:rgba(79,142,247,0.15);background:var(--bg-deep);color:var(--text-primary);font-family:'Mulish',sans-serif;min-height:100vh;display:flex;justify-content:center;align-items:flex-start;padding:40px 20px;overflow-x:hidden;position:relative;}
.champions *{margin:0;padding:0;box-sizing:border-box;}
.champions::before{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at 20% 20%,rgba(52,211,153,0.08) 0%,transparent 50%),radial-gradient(ellipse at 80% 80%,rgba(79,142,247,0.06) 0%,transparent 50%),radial-gradient(ellipse at 50% 0%,rgba(255,215,0,0.04) 0%,transparent 40%);z-index:0;pointer-events:none;}
.champions .container{position:relative;z-index:1;max-width:1100px;width:100%;}
.champions .header{text-align:center;margin-bottom:36px;}
.champions .header .trophy{font-size:56px;margin-bottom:8px;filter:drop-shadow(0 0 20px var(--glow-gold));}
.champions .header h1{font-family:'Unbounded',sans-serif;font-weight:700;font-size:42px;text-transform:uppercase;letter-spacing:4px;background:linear-gradient(90deg,#4f8ef7,#34d399,#f59e42);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.2;}
.champions .header .subtitle{font-family:'Unbounded',sans-serif;font-weight:400;font-size:16px;letter-spacing:6px;text-transform:uppercase;color:var(--text-muted);margin-top:8px;}
.champions .divider{width:120px;height:2px;margin:20px auto 0;background:linear-gradient(90deg,transparent,var(--gold),transparent);}
.champions .tabs{display:flex;justify-content:center;gap:6px;margin-bottom:32px;flex-wrap:wrap;}
.champions .tab{font-family:'Unbounded',sans-serif;font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:2px;padding:12px 28px;border:1px solid rgba(255,255,255,0.08);border-radius:8px 8px 0 0;background:rgba(255,255,255,0.03);color:var(--text-muted);cursor:pointer;transition:all 0.3s ease;user-select:none;}
.champions .tab:hover{background:rgba(255,255,255,0.06);color:var(--text-primary);}
.champions .tab.active{background:var(--bg-card);color:var(--gold);border-bottom-color:var(--bg-card);box-shadow:0 -2px 12px var(--glow-gold);}
.champions .tab-content{display:none;}
.champions .tab-content.active{display:block;}
.champions .section-header{font-family:'Unbounded',sans-serif;font-weight:600;font-size:18px;text-transform:uppercase;letter-spacing:3px;padding:16px 24px;margin-top:28px;margin-bottom:0;display:flex;align-items:center;gap:12px;}
.champions .section-header:first-child{margin-top:0;}
.champions .section-header .icon{font-size:22px;}
.champions .section-header .line{flex:1;height:1px;background:linear-gradient(90deg,rgba(255,255,255,0.12),transparent);}
.champions .section-material{color:var(--gold);}
.champions .section-nonmaterial{color:var(--accent-cyan);}
.champions .section-special{color:var(--accent-purple);}
.champions .table-wrapper{background:var(--bg-card);border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;box-shadow:0 4px 60px rgba(0,0,0,0.5),0 0 80px var(--glow-cyan);margin-top:0;}
.champions table{width:100%;border-collapse:collapse;}
.champions thead th{font-family:'Unbounded',sans-serif;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:3px;color:var(--text-muted);padding:16px 24px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.2);}
.champions thead th:first-child{text-align:center;width:64px;}
.champions thead th:last-child{text-align:center;}
.champions .table-special thead th:first-child{text-align:left;width:auto;}
.champions .table-special thead th:nth-child(2){text-align:center;}
.champions .table-special thead th:last-child{text-align:left;}
.champions tbody tr{transition:all 0.3s ease;border-bottom:1px solid rgba(255,255,255,0.03);}
.champions tbody tr:nth-child(odd){background:var(--bg-row);}
.champions tbody tr:nth-child(even){background:var(--bg-row-alt);}
.champions tbody tr:hover{background:rgba(52,211,153,0.08);}
.champions td{padding:16px 24px;font-size:15px;vertical-align:middle;}
.champions td:first-child{text-align:center;font-family:'Unbounded',sans-serif;font-weight:700;font-size:20px;}
.champions td:last-child{text-align:center;}
.champions .table-special td:first-child{text-align:left;font-family:'Mulish',sans-serif;font-size:15px;font-weight:700;}
.champions .table-special td:nth-child(2){text-align:center;}
.champions .table-special td:last-child{text-align:left;font-size:13px;color:var(--text-muted);line-height:1.4;}
.champions .name{font-weight:700;font-size:16px;letter-spacing:0.5px;}
.champions .place-other{color:var(--text-muted);}
.champions tr.row-1{background:linear-gradient(90deg,rgba(255,215,0,0.08),transparent 60%) !important;}
.champions tr.row-2{background:linear-gradient(90deg,rgba(192,192,192,0.06),transparent 60%) !important;}
.champions tr.row-3{background:linear-gradient(90deg,rgba(205,127,50,0.06),transparent 60%) !important;}
.champions .medal{display:inline-block;font-size:24px;line-height:1;}
.champions .name-gold{color:var(--gold);}
.champions .name-silver{color:var(--silver);}
.champions .name-bronze{color:var(--bronze);}
.champions .prize-badge{display:inline-block;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:700;letter-spacing:0.3px;white-space:nowrap;}
.champions .prize-money{background:linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,215,0,0.05));border:1px solid rgba(255,215,0,0.3);color:var(--gold);}
.champions .prize-time{background:linear-gradient(135deg,rgba(79,142,247,0.12),rgba(79,142,247,0.04));border:1px solid rgba(79,142,247,0.25);color:var(--accent-cyan);}
.champions .prize-food{background:linear-gradient(135deg,rgba(245,158,66,0.12),rgba(245,158,66,0.04));border:1px solid rgba(245,158,66,0.25);color:var(--accent-pink);}
.champions .footer{text-align:center;margin-top:32px;color:var(--text-muted);font-size:13px;letter-spacing:1px;opacity:0.5;}
.champions .csat-formula-block{background:var(--bg-card);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:12px 24px;margin:0 auto 20px;max-width:900px;text-align:center;}
.champions .csat-formula-eq{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;margin:6px 0 10px;font-family:'Unbounded',sans-serif;font-size:13px;letter-spacing:0.5px;}
.champions .formula-op{color:var(--text-muted);font-size:16px;font-weight:300;}
.champions .formula-part{padding:4px 10px;border-radius:6px;font-size:13px;letter-spacing:0.3px;}
.champions .formula-csat{background:rgba(79,142,247,0.1);color:var(--accent-cyan);border:1px solid rgba(79,142,247,0.2);}
.champions .formula-avg{background:rgba(52,211,153,0.1);color:var(--accent-purple);border:1px solid rgba(52,211,153,0.2);}
.champions .formula-first{background:rgba(255,215,0,0.1);color:var(--gold);border:1px solid rgba(255,215,0,0.2);}
.champions .csat-formula-weights{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:10px;}
.champions .weight-pill{font-size:11px;padding:3px 10px;border-radius:20px;font-family:'Mulish',sans-serif;font-weight:700;letter-spacing:0.3px;}
.champions .weight-csat{background:rgba(79,142,247,0.12);color:var(--accent-cyan);}
.champions .weight-avg{background:rgba(52,211,153,0.12);color:var(--accent-purple);}
.champions .weight-first{background:rgba(255,215,0,0.12);color:var(--gold);}
.champions .csat-calc-btn{display:block;margin:0 auto;background:linear-gradient(135deg,rgba(79,142,247,0.15),rgba(52,211,153,0.15));border:1px solid rgba(79,142,247,0.3);color:var(--accent-cyan);font-family:'Unbounded',sans-serif;font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:10px 20px;border-radius:8px;cursor:pointer;transition:all 0.2s;}
.champions .csat-calc-btn:hover{background:linear-gradient(135deg,rgba(79,142,247,0.25),rgba(52,211,153,0.25));border-color:var(--accent-cyan);box-shadow:0 0 12px rgba(79,142,247,0.2);}
.champions .calc-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;justify-content:center;align-items:center;backdrop-filter:blur(4px);}
.champions .calc-modal-overlay.active{display:flex;}
.champions .calc-modal{background:var(--bg-card);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;width:100%;max-width:420px;margin:20px;box-shadow:0 0 40px rgba(79,142,247,0.1),0 20px 60px rgba(0,0,0,0.6);}
.champions .calc-modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;}
.champions .calc-modal-header span{font-family:'Unbounded',sans-serif;font-size:16px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent-cyan);}
.champions .calc-close-btn{background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:color 0.2s;}
.champions .calc-close-btn:hover{color:var(--text-primary);}
.champions .calc-inputs{display:flex;flex-direction:column;gap:14px;margin-bottom:18px;}
.champions .calc-input-group label{display:block;font-size:11px;font-family:'Unbounded',sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px;}
.champions .calc-input-group input{width:100%;background:var(--bg-row);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:var(--text-primary);font-family:'Mulish',sans-serif;font-size:15px;padding:10px 14px;outline:none;transition:border-color 0.2s;}
.champions .calc-input-group input:focus{border-color:var(--accent-cyan);}
.champions .calc-run-btn{width:100%;background:linear-gradient(135deg,rgba(79,142,247,0.2),rgba(52,211,153,0.2));border:1px solid rgba(79,142,247,0.4);color:var(--accent-cyan);font-family:'Unbounded',sans-serif;font-size:14px;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:12px;border-radius:8px;cursor:pointer;transition:all 0.2s;margin-bottom:16px;}
.champions .calc-run-btn:hover{background:linear-gradient(135deg,rgba(79,142,247,0.3),rgba(52,211,153,0.3));box-shadow:0 0 16px rgba(79,142,247,0.2);}
.champions .calc-result{background:var(--bg-row);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;text-align:center;}
.champions .calc-result-label{font-family:'Unbounded',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;}
.champions .calc-result-value{font-family:'Unbounded',sans-serif;font-size:32px;font-weight:700;background:linear-gradient(135deg,var(--accent-cyan),var(--accent-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:10px;}
.champions .calc-result-breakdown{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--text-muted);}
.champions .calc-result-breakdown span{background:rgba(255,255,255,0.04);padding:3px 8px;border-radius:4px;}
`;

// section helpers for compact table generation
type Row = { rank: string; rankCls?: string; name: string; nameCls?: string; cols?: string[]; prize: string; prizeCls: string; rowCls?: string };
type Special = { name: string; prize: string; prizeCls: string; reason: string };

function mat(headers: string[], rows: Row[]): string {
  const th = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((r) => `<tr class="${r.rowCls || ''}">
    <td>${r.rankCls ? `<span class="${r.rankCls}">${r.rank}</span>` : r.rank}</td>
    <td><span class="name ${r.nameCls || ''}">${r.name}</span></td>
    ${(r.cols || []).map((c) => `<td>${c}</td>`).join('')}
    <td><span class="prize-badge ${r.prizeCls}">${r.prize}</span></td>
  </tr>`).join('');
  return `<div class="table-wrapper"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function special(rows: Special[]): string {
  const body = rows.map((r) => `<tr>
    <td><span class="name">${r.name}</span></td>
    <td><span class="prize-badge ${r.prizeCls}">${r.prize}</span></td>
    <td>${r.reason}</td>
  </tr>`).join('');
  return `<div class="table-wrapper"><table class="table-special"><thead><tr><th>Оператор</th><th>Приз</th><th>За что</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
const SH = (cls: string, icon: string, title: string) => `<div class="section-header ${cls}"><span class="icon">${icon}</span><span>${title}</span><span class="line"></span></div>`;
const matHdr = SH('section-material', '💰', 'Материальные призы');
const nonHdr = SH('section-nonmaterial', '⭐', 'Нематериальные призы');
const spcHdr = SH('section-special', '🌟', 'Вне конкурса — за особые заслуги');
const H4 = ['Место', 'Оператор', 'Чемпионский балл', 'Приз'];
const H7 = ['Место', 'Оператор', 'КСАТ', 'Принятие', 'Среднее', 'Чемпионский балл', 'Приз'];

const PRIZE_TIME3 = 'Уйти на 3 ч раньше', PRIZE_TIME2 = 'Уйти на 2 ч раньше', PRIZE_TIME1 = 'Уйти на 1 ч раньше';
const PRIZE_FOOD2 = '2 обеда по 2 часа', PRIZE_FOOD1 = '1 обед 2 часа';
const M3 = '3 000 грн', M2 = '2 000 грн', M1 = '1 000 грн', M = '1 000 грн';

// ── December 2025 ──
const TAB_DEC = matHdr + mat(H4, [
  { rank: '🥇', rankCls: 'medal', name: 'Chandler', nameCls: 'name-gold', cols: ['1 664 866 712'], prize: M3, prizeCls: 'prize-money', rowCls: 'row-1' },
  { rank: '🥈', rankCls: 'medal', name: 'Melvin', nameCls: 'name-silver', cols: ['1 580 317 224'], prize: M2, prizeCls: 'prize-money', rowCls: 'row-2' },
  { rank: '🥉', rankCls: 'medal', name: 'Trinity', nameCls: 'name-bronze', cols: ['1 548 663 102'], prize: M1, prizeCls: 'prize-money', rowCls: 'row-3' },
]) + nonHdr + mat(H4, [
  { rank: '4', rankCls: 'place-other', name: 'Kenzo', cols: ['1 136 710 623'], prize: PRIZE_TIME3, prizeCls: 'prize-time' },
  { rank: '5', rankCls: 'place-other', name: 'Christine', cols: ['1 127 988 010'], prize: PRIZE_FOOD2, prizeCls: 'prize-food' },
  { rank: '6', rankCls: 'place-other', name: 'Felicia', cols: ['1 090 023 522'], prize: PRIZE_TIME1, prizeCls: 'prize-time' },
  { rank: '7', rankCls: 'place-other', name: 'Tom', cols: ['1 087 760 375'], prize: PRIZE_FOOD1, prizeCls: 'prize-food' },
  { rank: '8', rankCls: 'place-other', name: 'Ashton', cols: ['1 063 593 968'], prize: PRIZE_TIME2, prizeCls: 'prize-time' },
]) + spcHdr + special([
  { name: 'Rudy', prize: M, prizeCls: 'prize-money', reason: 'Один из лучших показателей на НК' },
  { name: 'Denzel', prize: M, prizeCls: 'prize-money', reason: 'Лучший КСАТ' },
  { name: 'Plover', prize: M, prizeCls: 'prize-money', reason: 'За активную помощь на НК' },
  { name: 'Fabio', prize: M, prizeCls: 'prize-money', reason: 'За активную помощь на НК' },
]);

// ── January 2026 ──
const TAB_JAN = matHdr + mat(H4, [
  { rank: '🥇', rankCls: 'medal', name: 'Tom', nameCls: 'name-gold', cols: ['1 307 061 688'], prize: M3, prizeCls: 'prize-money', rowCls: 'row-1' },
  { rank: '🥈', rankCls: 'medal', name: 'Kenzo', nameCls: 'name-silver', cols: ['1 293 008 658'], prize: M2, prizeCls: 'prize-money', rowCls: 'row-2' },
  { rank: '🥉', rankCls: 'medal', name: 'Trinity', nameCls: 'name-bronze', cols: ['1 290 435 606'], prize: M1, prizeCls: 'prize-money', rowCls: 'row-3' },
]) + nonHdr + mat(H4, [
  { rank: '4', rankCls: 'place-other', name: 'Christine', cols: ['1 142 953 580'], prize: PRIZE_FOOD2, prizeCls: 'prize-food' },
  { rank: '5', rankCls: 'place-other', name: 'Ashton', cols: ['1 130 371 456'], prize: PRIZE_TIME3, prizeCls: 'prize-time' },
  { rank: '6', rankCls: 'place-other', name: 'Silvia', cols: ['1 093 195 268'], prize: PRIZE_TIME1, prizeCls: 'prize-time' },
  { rank: '7', rankCls: 'place-other', name: 'Scott', cols: ['1 091 181 313'], prize: PRIZE_TIME2, prizeCls: 'prize-time' },
  { rank: '8', rankCls: 'place-other', name: 'Chadwick', cols: ['1 086 804 045'], prize: PRIZE_FOOD1, prizeCls: 'prize-food' },
]) + spcHdr + special([
  { name: 'Frey', prize: M, prizeCls: 'prize-money', reason: 'Один из лучших показателей на НК' },
  { name: 'Shin', prize: M, prizeCls: 'prize-money', reason: 'Активное участие в развитии НК' },
  { name: 'Richard', prize: M, prizeCls: 'prize-money', reason: 'Стабильно хорошие показатели, активное вовлечение в развитие СГ' },
  { name: 'River', prize: M, prizeCls: 'prize-money', reason: 'Разработка приложений для сапорта' },
]);

// ── February 2026 (7-column tables) ──
const TAB_FEB = matHdr + mat(H7, [
  { rank: '🥇', rankCls: 'medal', name: 'Ashton', nameCls: 'name-gold', cols: ['86.50%', '3.75', '25.75', '1 338 609 307'], prize: M3, prizeCls: 'prize-money', rowCls: 'row-1' },
  { rank: '🥈', rankCls: 'medal', name: 'Tom', nameCls: 'name-silver', cols: ['97.50%', '11.00', '36.75', '1 324 115 260'], prize: M2, prizeCls: 'prize-money', rowCls: 'row-2' },
  { rank: '🥉', rankCls: 'medal', name: 'Kenzo', nameCls: 'name-bronze', cols: ['91.00%', '7.00', '39.00', '1 294 090 909'], prize: M1, prizeCls: 'prize-money', rowCls: 'row-3' },
]) + nonHdr + mat(H7, [
  { rank: '4', rankCls: 'place-other', name: 'Chadwick', cols: ['91.75%', '8.25', '40.25', '1 285 351 732'], prize: PRIZE_TIME3, prizeCls: 'prize-time' },
  { rank: '5', rankCls: 'place-other', name: 'Trinity', cols: ['84.00%', '4.33', '37.33', '1 266 489 899'], prize: PRIZE_FOOD2, prizeCls: 'prize-food' },
  { rank: '6', rankCls: 'place-other', name: 'Shane', cols: ['91.00%', '7.00', '48.00', '1 256 590 909'], prize: PRIZE_TIME2, prizeCls: 'prize-time' },
  { rank: '7', rankCls: 'place-other', name: 'Christine', cols: ['90.00%', '6.25', '49.25', '1 249 215 368'], prize: PRIZE_FOOD1, prizeCls: 'prize-food' },
  { rank: '8', rankCls: 'place-other', name: 'Skylar', cols: ['89.00%', '13.50', '38.50', '1 231 839 827'], prize: PRIZE_TIME1, prizeCls: 'prize-time' },
]) + spcHdr + special([
  { name: 'Ren / Глеб', prize: M, prizeCls: 'prize-money', reason: 'Лучший КСАТ на НК, отличные показатели' },
  { name: 'Shin', prize: M, prizeCls: 'prize-money', reason: 'Активное участие в развитии НК, заполнение кондфло, обучения' },
  { name: 'Lucas', prize: M, prizeCls: 'prize-money', reason: 'Один из лучших показателей команды, активное участие в процессах, таски' },
  { name: 'Reed', prize: M, prizeCls: 'prize-money', reason: 'Хорошая и стабильная работа с жалобами + новые обязанности' },
  { name: 'Luciana / Ольга', prize: M, prizeCls: 'prize-money', reason: 'Один из лучших показателей НК' },
  { name: 'Frey / Ева', prize: PRIZE_TIME3, prizeCls: 'prize-time', reason: 'Один из лучших показателей НК' },
]);

// ── March 2026 ──
const TAB_MAR = matHdr + mat(H4, [
  { rank: '🥇', rankCls: 'medal', name: 'Tom', nameCls: 'name-gold', cols: ['1 374 761 905'], prize: M3, prizeCls: 'prize-money', rowCls: 'row-1' },
  { rank: '🥈', rankCls: 'medal', name: 'Trinity', nameCls: 'name-silver', cols: ['1 359 675 325'], prize: M2, prizeCls: 'prize-money', rowCls: 'row-2' },
  { rank: '🥉', rankCls: 'medal', name: 'Ashton', nameCls: 'name-bronze', cols: ['1 351 006 494'], prize: M1, prizeCls: 'prize-money', rowCls: 'row-3' },
]) + nonHdr + mat(H4, [
  { rank: '4', rankCls: 'place-other', name: 'Rudy', cols: ['1 324 115 260'], prize: PRIZE_TIME3, prizeCls: 'prize-time' },
  { rank: '5', rankCls: 'place-other', name: 'Kenzo', cols: ['1 297 716 450'], prize: PRIZE_FOOD2, prizeCls: 'prize-food' },
  { rank: '6', rankCls: 'place-other', name: 'Robin', cols: ['1 265 844 156'], prize: PRIZE_TIME2, prizeCls: 'prize-time' },
  { rank: '7', rankCls: 'place-other', name: 'Caleb', cols: ['1 264 940 476'], prize: PRIZE_FOOD1, prizeCls: 'prize-food' },
  { rank: '8', rankCls: 'place-other', name: 'Skylar', cols: ['1 263 257 576'], prize: PRIZE_TIME1, prizeCls: 'prize-time' },
]) + spcHdr + special([
  { name: 'Tom', prize: M, prizeCls: 'prize-money', reason: 'За показатели продаж' },
  { name: 'Holly', prize: M, prizeCls: 'prize-money', reason: 'За показатели продаж' },
  { name: 'Scott', prize: M, prizeCls: 'prize-money', reason: 'За показатели продаж' },
  { name: 'Denzel', prize: M, prizeCls: 'prize-money', reason: 'За показатели продаж' },
]);

// ── April 2026 ──
const TAB_APR = matHdr + mat(H4, [
  { rank: '🥇', rankCls: 'medal', name: 'Ashton', nameCls: 'name-gold', cols: ['1 317 835 498'], prize: M3, prizeCls: 'prize-money', rowCls: 'row-1' },
  { rank: '🥈', rankCls: 'medal', name: 'Kenzo', nameCls: 'name-silver', cols: ['1 314 004 329'], prize: M2, prizeCls: 'prize-money', rowCls: 'row-2' },
  { rank: '🥉', rankCls: 'medal', name: 'Nolan', nameCls: 'name-bronze', cols: ['1 255 670 996'], prize: M1, prizeCls: 'prize-money', rowCls: 'row-3' },
]) + nonHdr + mat(H4, [
  { rank: '4', rankCls: 'place-other', name: 'Tom', cols: ['1 239 253 247'], prize: PRIZE_TIME3, prizeCls: 'prize-time' },
  { rank: '5', rankCls: 'place-other', name: 'Skylar', cols: ['1 237 835 498'], prize: PRIZE_FOOD2, prizeCls: 'prize-food' },
  { rank: '6', rankCls: 'place-other', name: 'Chadwick', cols: ['1 223 127 706'], prize: PRIZE_TIME2, prizeCls: 'prize-time' },
  { rank: '7', rankCls: 'place-other', name: 'Trinity', cols: ['1 179 707 792'], prize: PRIZE_FOOD1, prizeCls: 'prize-food' },
  { rank: '8', rankCls: 'place-other', name: 'Earl', cols: ['1 172 725 108'], prize: PRIZE_TIME1, prizeCls: 'prize-time' },
]) + spcHdr + special([
  { name: 'Debra / Кира', prize: M, prizeCls: 'prize-money', reason: 'Лучшие показатели на НК' },
  { name: 'Warren', prize: M, prizeCls: 'prize-money', reason: 'Лучшая КК' },
  { name: 'Adam', prize: M, prizeCls: 'prize-money', reason: 'Одни из лучших показателей команды, активное участие в работе, таски' },
  { name: 'Nora', prize: M, prizeCls: 'prize-money', reason: 'Топ показатель КСАТ в Chatwoot' },
]);

// ── May 2026 ──
const TAB_MAY = matHdr + mat(H4, [
  { rank: '🥇', rankCls: 'medal', name: 'Trinity', nameCls: 'name-gold', cols: ['1 371 839 827'], prize: M3, prizeCls: 'prize-money', rowCls: 'row-1' },
  { rank: '🥈', rankCls: 'medal', name: 'Christine', nameCls: 'name-silver', cols: ['1 340 259 740'], prize: M2, prizeCls: 'prize-money', rowCls: 'row-2' },
  { rank: '🥉', rankCls: 'medal', name: 'Kenzo', nameCls: 'name-bronze', cols: ['1 301 075 758'], prize: M1, prizeCls: 'prize-money', rowCls: 'row-3' },
  { rank: '4', rankCls: 'place-other', name: 'Joseph', cols: ['1 249 794 372'], prize: M1, prizeCls: 'prize-money' },
]) + nonHdr + mat(H4, [
  { rank: '5', rankCls: 'place-other', name: 'Nolan', cols: ['1 227 586 580'], prize: PRIZE_FOOD2, prizeCls: 'prize-food' },
  { rank: '6', rankCls: 'place-other', name: 'Earl', cols: ['1 227 393 939'], prize: PRIZE_TIME2, prizeCls: 'prize-time' },
  { rank: '7', rankCls: 'place-other', name: 'Balfour', cols: ['1 208 766 234'], prize: PRIZE_FOOD1, prizeCls: 'prize-food' },
  { rank: '8', rankCls: 'place-other', name: 'Ashton', cols: ['1 204 329 004'], prize: PRIZE_TIME1, prizeCls: 'prize-time' },
  { rank: '9', rankCls: 'place-other', name: 'Will', cols: ['1 193 305 195'], prize: PRIZE_TIME1, prizeCls: 'prize-time' },
]) + spcHdr + special([
  { name: 'Debra / Кира', prize: M, prizeCls: 'prize-money', reason: 'Лучшие показатели на НК' },
  { name: 'Jayden', prize: M, prizeCls: 'prize-money', reason: 'Обучение продажам сапорта' },
  { name: 'Anna', prize: M, prizeCls: 'prize-money', reason: 'Обучение продажам сапорта' },
]);

const BODY_HTML = `
<div class="container">
  <div class="header">
    <div class="trophy">🏆</div>
    <h1>Зал славы поддержки</h1>
    <div class="subtitle">Лучшие операторы по итогам чемпионата</div>
    <div class="divider"></div>
  </div>
  <div id="mode-championship">
    <div class="csat-formula-block">
      <div class="legend-formula-title">💡 Как считается Чемпионский балл</div>
      <div class="csat-formula-eq">
        <span class="formula-part formula-csat">(КСАТ / 77%) × 60%</span>
        <span class="formula-op">+</span>
        <span class="formula-part formula-avg">(1 + (60 − Среднее) / 60) × 25%</span>
        <span class="formula-op">+</span>
        <span class="formula-part formula-first">(1 + (20 − Принятие) / 20) × 15%</span>
      </div>
      <div class="csat-formula-weights">
        <span class="weight-pill weight-csat">КСАТ — 60%</span>
        <span class="weight-pill weight-avg">Среднее время ответа — 25%</span>
        <span class="weight-pill weight-first">Принятие — 15%</span>
      </div>
      <button class="csat-calc-btn" data-act="open-calc">🧮 Калькулятор чемпионского балла</button>
    </div>
    <div class="tabs">
      <div class="tab" data-tab="dec">Декабрь 2025</div>
      <div class="tab" data-tab="jan">Январь 2026</div>
      <div class="tab" data-tab="feb">Февраль 2026</div>
      <div class="tab" data-tab="mar">Март 2026</div>
      <div class="tab" data-tab="apr">Апрель 2026</div>
      <div class="tab active" data-tab="may">Май 2026</div>
    </div>
    <div id="tab-dec" class="tab-content">${TAB_DEC}</div>
    <div id="tab-jan" class="tab-content">${TAB_JAN}</div>
    <div id="tab-feb" class="tab-content">${TAB_FEB}</div>
    <div id="tab-mar" class="tab-content">${TAB_MAR}</div>
    <div id="tab-apr" class="tab-content">${TAB_APR}</div>
    <div id="tab-may" class="tab-content active">${TAB_MAY}</div>
  </div>
  <div class="footer">✦ Поздравляем всех победителей ✦</div>
</div>
<div id="calc-modal-overlay" class="calc-modal-overlay">
  <div class="calc-modal">
    <div class="calc-modal-header">
      <span>🧮 Калькулятор</span>
      <button class="calc-close-btn" data-act="close-calc">✕</button>
    </div>
    <div class="calc-inputs">
      <div class="calc-input-group"><label>КСАТ (%)</label><input type="number" id="calc-csat" placeholder="напр. 97.5" min="0" max="100" step="0.1"></div>
      <div class="calc-input-group"><label>Принятие — время первого ответа (мин)</label><input type="number" id="calc-first" placeholder="напр. 4" min="0" step="0.1"></div>
      <div class="calc-input-group"><label>Среднее — время между ответами (мин)</label><input type="number" id="calc-avg" placeholder="напр. 26" min="0" step="0.1"></div>
    </div>
    <button class="calc-run-btn" data-act="run-calc">Рассчитать</button>
    <div id="calc-result" class="calc-result" style="display:none"></div>
  </div>
</div>
`;

export default function ChampionsPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (id: string) => root.querySelector('#' + id) as HTMLElement | null;
    const overlay = $('calc-modal-overlay')!;

    function switchTab(month: string) {
      root!.querySelectorAll('#mode-championship .tab').forEach((t) => t.classList.remove('active'));
      root!.querySelectorAll('#mode-championship .tab-content').forEach((c) => c.classList.remove('active'));
      const tabs = root!.querySelectorAll('#mode-championship .tab');
      const map: Record<string, number> = { dec: 0, jan: 1, feb: 2, mar: 3, apr: 4, may: 5 };
      tabs[map[month]]?.classList.add('active');
      $('tab-' + month)?.classList.add('active');
    }
    function openCalc() { overlay.classList.add('active'); }
    function closeCalc() { overlay.classList.remove('active'); }
    function calcChampScore() {
      const csat = parseFloat(($('calc-csat') as HTMLInputElement).value);
      const first = parseFloat(($('calc-first') as HTMLInputElement).value);
      const avg = parseFloat(($('calc-avg') as HTMLInputElement).value);
      const resultEl = $('calc-result')!;
      resultEl.style.display = 'block';
      if (isNaN(csat) || isNaN(first) || isNaN(avg)) {
        resultEl.innerHTML = '<span style="color:var(--accent-red);font-family:\'Mulish\',sans-serif;font-size:13px;">Пожалуйста, заполните все поля</span>';
        return;
      }
      const csatDec = csat / 100;
      const sCsat = (csatDec / 0.77) * 0.60;
      const sAvg = (1 + (60 - avg) / 60) * 0.25;
      const sFirst = (1 + (20 - first) / 20) * 0.15;
      const score = sCsat + sAvg + sFirst;
      const fmtB = (v: number) => Math.round(v * 1000000000).toLocaleString('ru');
      resultEl.innerHTML = `
        <div class="calc-result-label">Чемпионский балл</div>
        <div class="calc-result-value">${fmtB(score)}</div>
        <div class="calc-result-breakdown">
          <span>КСАТ: +${fmtB(sCsat)}</span>
          <span>Среднее: +${fmtB(sAvg)}</span>
          <span>Принятие: +${fmtB(sFirst)}</span>
        </div>`;
    }

    const onClick = (e: Event) => {
      const t = (e.target as HTMLElement).closest('[data-tab],[data-act]') as HTMLElement | null;
      if (!t) return;
      if (t.dataset.tab) switchTab(t.dataset.tab);
      else if (t.dataset.act === 'open-calc') openCalc();
      else if (t.dataset.act === 'close-calc') closeCalc();
      else if (t.dataset.act === 'run-calc') calcChampScore();
    };
    root.addEventListener('click', onClick);
    const onOverlayClick = (e: Event) => { if (e.target === overlay) closeCalc(); };
    overlay.addEventListener('click', onOverlayClick);

    return () => { root.removeEventListener('click', onClick); overlay.removeEventListener('click', onOverlayClick); };
  }, []);

  return (
    <div className="champions" ref={rootRef}>
      <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;600;700&family=Mulish:wght@300;400;600;700;800&display=swap" rel="stylesheet" />
      <style>{CSS}</style>
      <BackButton to="/support" />
      <div dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
    </div>
  );
}
