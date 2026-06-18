import { useEffect, useRef } from 'react';
import BackButton from '@/components/BackButton';

// Operation Structure — port of ops/structure/index.html
// Self-contained org-chart editor: contenteditable cards, interactive tree,
// SVG connectors, autosave to external Worker API. The original is a tightly
// coupled imperative DOM app; we preserve it verbatim inside a scoped effect.

// Оргструктура хранится в собственном воркере v2 (same-origin), не во внешнем сервисе.
const API_URL = '/api/ops/structure';

const BODY_HTML = `
<div class="top-bar">
  <div class="pill">FTE: <b id="fteTotal">—</b></div>
  <div class="pill">Отделов: <b>10</b></div>
  <button class="btn" id="editBtn">✎ Редактировать</button>
  <span id="saveStatus" style="font-size:12px;color:#22c55e;opacity:0;transition:opacity 0.5s;padding:5px 10px;"></span>
</div>
<div class="edit-hint" id="editHint"></div>
<div style="display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:0;padding:0 20px;position:relative;">
  <div id="headNode" style="background:#e8e4ff;border:2px solid #7060c0;border-radius:12px;padding:14px 48px;text-align:center;white-space:nowrap;box-shadow:0 3px 12px rgba(100,80,200,.15);">
    <span style="font-size:16px;font-weight:600;color:#3020a0;">Head of Operations</span>
  </div>
  <div style="width:32px;height:1px;background:#b0b8d8;flex-shrink:0;"></div>
  <div style="background:#f0f0ff;border:1px solid #a0a0d8;border-radius:8px;padding:5px 14px;text-align:center;white-space:nowrap;">
    <div style="font-size:11px;font-weight:500;color:#5050b0;">Operation Manager</div>
    <div style="font-size:10px;color:#9090b8;margin-top:1px;">3</div>
  </div>
</div>
<div id="connectorWrap" style="position:relative;width:100%;"></div>
<div class="grid" id="grid"></div>
<div class="su-ov" id="suOv">
  <div class="su-panel" id="suPanel">
    <div class="su-head">
      <div>
        <div class="su-head-title" id="suTitle">Структура отдела</div>
        <div class="su-head-sub" id="suSub"></div>
      </div>
      <button class="close-btn" id="suCloseBtn">✕ закрыть</button>
    </div>
    <div class="su-body" id="suBody"></div>
  </div>
</div>
<div class="add-node-modal" id="addNodeModal">
  <div class="add-node-box">
    <h3>➕ Добавить узел</h3>
    <label>Название позиции</label>
    <input type="text" id="addNodeName" placeholder="напр. Senior Supervisor"/>
    <label>Количество человек</label>
    <input type="number" id="addNodeCount" placeholder="1" value="1" min="0" step="0.5"/>
    <label id="addNodeParentLabel">Родительский узел</label>
    <select id="addNodeParent" style="width:100%;border:1px solid #c0c8e0;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;margin-bottom:8px;font-family:inherit;background:#fff;"></select>
    <label>Уровень (стиль)</label>
    <select id="addNodeLevel">
      <option value="lv-head">Head (фиолетовый)</option>
      <option value="lv-tl">TL (светло-фиолетовый)</option>
      <option value="lv-sup" selected>Supervisor (синий)</option>
      <option value="lv-mgr">Manager (голубой)</option>
      <option value="lv-vip">VIP (сиреневый)</option>
      <option value="lv-qa">QA (зелёный)</option>
      <option value="lv-dr">Other (розовый)</option>
      <option value="lv-nk">NC/NK (жёлтый)</option>
    </select>
    <div class="add-node-btns">
      <button class="anb-cancel" id="anbCancel">Отмена</button>
      <button class="anb-ok" id="anbOk">Добавить</button>
    </div>
  </div>
</div>
`;

const CSS = `
.ops-structure{color-scheme:light;background:#f0f2f7;font-family:'Segoe UI',system-ui,sans-serif;color:#1a1e2e;min-height:100vh;padding:20px 16px 40px;}
.ops-structure *{box-sizing:border-box;}
.ops-structure .top-bar{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;}
.ops-structure .pill{background:#fff;border:0.5px solid #d0d4e4;border-radius:20px;padding:5px 14px;font-size:12px;color:#5a6080;box-shadow:0 1px 3px rgba(0,0,0,.06);}
.ops-structure .pill b{color:#1a1e2e;font-weight:500;}
.ops-structure .btn{background:#fff;border:0.5px solid #c0c8e0;border-radius:20px;padding:5px 16px;font-size:12px;color:#4a5480;cursor:pointer;transition:all .15s;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.06);}
.ops-structure .btn:hover{background:#f0f2ff;color:#3040a0;border-color:#8090d0;}
.ops-structure .btn.edit-on{background:#e8ecff;border-color:#5560cc;color:#3040a0;}
.ops-structure .edit-hint{font-size:11px;color:#8090b0;text-align:center;margin-bottom:8px;transition:opacity .2s;}
.ops-structure .grid{display:grid;grid-template-columns:repeat(10,1fr);width:100%;}
.ops-structure .dept-col{display:flex;flex-direction:column;align-items:stretch;padding:0 3px;}
.ops-structure .card{border-radius:10px;overflow:hidden;border:1px solid;width:100%;}
.ops-structure .card-head{padding:10px 10px 9px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;user-select:none;}
.ops-structure .dname{font-size:13px;font-weight:500;display:block;line-height:1.3;}
.ops-structure .dtotal{font-size:11px;display:block;margin-top:3px;opacity:1;font-weight:500;}
.ops-structure .darr{font-size:10px;display:block;margin-top:4px;opacity:.5;transition:transform .2s;}
.ops-structure .dept-col.open .darr{transform:rotate(180deg);opacity:.6;}
.ops-structure .card-body{display:none;padding:6px 10px 9px;background:rgba(255,255,255,.5);}
.ops-structure .dept-col.open .card-body{display:block;}
.ops-structure .role-row{display:flex;justify-content:space-between;align-items:center;gap:4px;padding:3px 0;border-bottom:0.5px solid rgba(0,0,0,.06);}
.ops-structure .role-row:last-child{border-bottom:none;}
.ops-structure .rn{font-size:11.5px;color:#2a3060;flex:1;}
.ops-structure .rc{font-size:11.5px;font-weight:500;white-space:nowrap;}
.ops-structure .expand-btn{display:block;width:100%;margin:4px 0 0;background:rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.18);border-radius:6px;color:rgba(0,0,0,.65);font-size:11px;font-weight:500;padding:6px 0;cursor:pointer;text-align:center;transition:background .15s,color .15s;}
.ops-structure .expand-btn:hover{background:rgba(0,0,0,.13);color:rgba(0,0,0,.95);}
.ops-structure.editing .rn,.ops-structure.editing .rc,.ops-structure.editing .dname{cursor:text;outline:1px dashed rgba(60,80,200,.3);outline-offset:1px;border-radius:3px;}
.ops-structure.editing .rn:hover,.ops-structure.editing .rc:hover,.ops-structure.editing .dname:hover{outline-color:rgba(60,80,200,.6);background:rgba(80,100,220,.08);}
.ops-structure.editing .role-row{padding-right:20px;position:relative;}
.ops-structure.editing .del-row{display:flex;}
.ops-structure .del-row{display:none;position:absolute;right:0;top:50%;transform:translateY(-50%);background:none;border:none;color:rgba(180,40,40,.5);font-size:11px;cursor:pointer;padding:2px 3px;line-height:1;}
.ops-structure .del-row:hover{color:#cc4444;}
.ops-structure.editing .add-row-btn{display:block;}
.ops-structure .add-row-btn{display:none;width:100%;margin-top:4px;background:rgba(40,120,60,.06);border:0.5px dashed rgba(40,120,60,.4);border-radius:5px;color:rgba(30,130,60,.6);font-size:10px;padding:4px 0;cursor:pointer;text-align:center;transition:all .15s;}
.ops-structure .add-row-btn:hover{background:rgba(40,120,60,.15);color:rgba(20,140,60,.9);}
.ops-structure .cc-c{background:#dceeff;border-color:#4080c0;}.ops-structure .cc-h{background:#c8e0f8;}.ops-structure .cc-n{color:#0a3a80;}.ops-structure .cc-t{color:#0a3a80;}.ops-structure .cc-r{color:#0a3a80;}
.ops-structure .py-c{background:#fde8bc;border-color:#a07020;}.ops-structure .py-h{background:#fcd8a0;}.ops-structure .py-n{color:#603800;}.ops-structure .py-t{color:#603800;}.ops-structure .py-r{color:#603800;}
.ops-structure .su-c{background:#dddaff;border-color:#5050c0;}.ops-structure .su-h{background:#ccc8ff;}.ops-structure .su-n{color:#200080;}.ops-structure .su-t{color:#200080;}.ops-structure .su-r{color:#200080;}
.ops-structure .af-c{background:#fdd0c8;border-color:#b04030;}.ops-structure .af-h{background:#fcbcb0;}.ops-structure .af-n{color:#700000;}.ops-structure .af-t{color:#700000;}.ops-structure .af-r{color:#700000;}
.ops-structure .bn-c{background:#d8f0c4;border-color:#4a8020;}.ops-structure .bn-h{background:#c0e4a8;}.ops-structure .bn-n{color:#204000;}.ops-structure .bn-t{color:#204000;}.ops-structure .bn-r{color:#204000;}
.ops-structure .rc-c{background:#fdd0e8;border-color:#a04080;}.ops-structure .rc-h{background:#fbb8d8;}.ops-structure .rc-n{color:#600040;}.ops-structure .rc-t{color:#600040;}.ops-structure .rc-r{color:#600040;}
.ops-structure .ds-c{background:#e4e4e0;border-color:#707070;}.ops-structure .ds-h{background:#d4d4d0;}.ops-structure .ds-n{color:#1a1a1a;}.ops-structure .ds-t{color:#1a1a1a;}.ops-structure .ds-r{color:#1a1a1a;}
.ops-structure .cn-c{background:#e4e4e0;border-color:#707070;}.ops-structure .cn-h{background:#d4d4d0;}.ops-structure .cn-n{color:#1a1a1a;}.ops-structure .cn-t{color:#1a1a1a;}.ops-structure .cn-r{color:#1a1a1a;}
.ops-structure .cr-c{background:#fde0c0;border-color:#a05020;}.ops-structure .cr-h{background:#fcc898;}.ops-structure .cr-n{color:#602000;}.ops-structure .cr-t{color:#602000;}.ops-structure .cr-r{color:#602000;}
.ops-structure .dl-c{background:#d8eeff;border-color:#3070b0;}.ops-structure .dl-h{background:#bcdcf8;}.ops-structure .dl-n{color:#0a2a60;}.ops-structure .dl-t{color:#0a2a60;}.ops-structure .dl-r{color:#0a2a60;}
.ops-structure .su-ov{display:none;position:fixed;inset:0;z-index:1001;background:rgba(200,205,220,.75);backdrop-filter:blur(8px);overflow-y:auto;}
.ops-structure .su-ov.active{display:block;}
.ops-structure .su-panel{background:#fff;border:1px solid #d0d4e8;border-radius:16px;width:calc(100% - 32px);margin:16px auto;box-shadow:0 8px 40px rgba(0,0,0,.15);}
.ops-structure .su-head{padding:16px 22px 13px;border-bottom:1px solid rgba(0,0,0,.08);display:flex;align-items:center;justify-content:space-between;border-radius:16px 16px 0 0;background:#fff;position:sticky;top:0;z-index:2;}
.ops-structure .su-head-title{font-size:18px;font-weight:500;color:#3030a0;}
.ops-structure .su-head-sub{font-size:11px;color:#8090b0;margin-top:2px;}
.ops-structure .su-body{padding:24px 28px 32px;overflow-x:auto;}
.ops-structure .close-btn{background:#f0f2f8;border:0.5px solid #c0c8e0;border-radius:8px;color:#5060a0;font-size:13px;padding:5px 12px;cursor:pointer;flex-shrink:0;margin-left:12px;transition:background .15s;}
.ops-structure .close-btn:hover{background:#e0e4f4;color:#2030a0;}
.ops-structure .tree-wrap{overflow-x:auto;padding:10px 0;}
.ops-structure .tree-node-wrap{display:flex;flex-direction:column;align-items:center;}
.ops-structure .tree-node{position:relative;display:inline-flex;align-items:center;gap:4px;}
.ops-structure .tree-node-box{border-radius:8px;border:1px solid;padding:7px 12px;text-align:center;white-space:nowrap;min-width:100px;}
.ops-structure .tree-node-box .tn-title{font-size:12px;font-weight:500;display:block;}
.ops-structure .tree-node-box .tn-count{font-size:11px;display:block;margin-top:1px;color:#7080a0;}
.ops-structure .tree-node-actions{display:none;position:absolute;top:-6px;right:-22px;flex-direction:column;gap:2px;z-index:10;}
.ops-structure.editing .tree-node{position:relative;}
.ops-structure.editing .tree-node-actions{display:flex;}
.ops-structure .tna-btn{width:18px;height:18px;border-radius:4px;border:none;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;transition:all .15s;}
.ops-structure .tna-add{background:rgba(40,160,60,.12);color:#1a9040;}
.ops-structure .tna-add:hover{background:rgba(40,160,60,.3);}
.ops-structure .tna-del{background:rgba(180,40,40,.1);color:#b02020;}
.ops-structure .tna-del:hover{background:rgba(180,40,40,.25);}
.ops-structure .tree-v-line{width:1px;height:18px;background:#b0b8d8;margin:0 auto;}
.ops-structure .tree-h-bar{display:flex;align-items:flex-start;justify-content:center;}
.ops-structure .tree-child-col{display:flex;flex-direction:column;align-items:center;padding:0 8px;position:relative;}
.ops-structure .tree-child-drop{width:1px;height:18px;background:#b0b8d8;margin:0 auto;}
.ops-structure .tree-h-bar .tree-child-col{border-top:1px solid #b0b8d8;margin-top:0;}
.ops-structure .tree-h-bar .tree-child-col:first-child{border-top:none;position:relative;}
.ops-structure .tree-h-bar .tree-child-col:first-child::after{content:'';position:absolute;top:0;left:50%;right:0;height:1px;background:#b0b8d8;}
.ops-structure .tree-h-bar .tree-child-col:last-child{border-top:none;position:relative;}
.ops-structure .tree-h-bar .tree-child-col:last-child::after{content:'';position:absolute;top:0;left:0;right:50%;height:1px;background:#b0b8d8;}
.ops-structure .tree-h-bar .tree-child-col:first-child:last-child{border-top:none;}
.ops-structure .tree-h-bar .tree-child-col:first-child:last-child::after{display:none;}
.ops-structure .lv-head{background:#eeeaff;border-color:#7060d0;} .ops-structure .lv-head .tn-title{color:#3020a0;font-size:13px;}
.ops-structure .lv-tl{background:#e8e6ff;border-color:#9080e0;} .ops-structure .lv-tl .tn-title{color:#4030b0;}
.ops-structure .lv-sup{background:#e4eaff;border-color:#8090d0;} .ops-structure .lv-sup .tn-title{color:#3050c0;}
.ops-structure .lv-mgr{background:#e4f2f8;border-color:#6090c0;} .ops-structure .lv-mgr .tn-title{color:#2070a0;}
.ops-structure .lv-vip{background:#f4eaff;border-color:#b080e0;} .ops-structure .lv-vip .tn-title{color:#7030c0;}
.ops-structure .lv-qa{background:#e4f8ea;border-color:#60c080;} .ops-structure .lv-qa .tn-title{color:#207040;}
.ops-structure .lv-dr{background:#fce8f4;border-color:#d080b0;} .ops-structure .lv-dr .tn-title{color:#902070;}
.ops-structure .lv-nk{background:#faf4e4;border-color:#c0a040;} .ops-structure .lv-nk .tn-title{color:#806010;}
.ops-structure.editing .tree-node-box .tn-title{cursor:text;outline:1px dashed rgba(60,80,200,.3);border-radius:2px;}
.ops-structure.editing .tree-node-box .tn-count{cursor:text;outline:1px dashed rgba(60,80,200,.3);border-radius:2px;}
.ops-structure .add-node-modal{display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);align-items:center;justify-content:center;}
.ops-structure .add-node-modal.active{display:flex;}
.ops-structure .add-node-box{background:#fff;border-radius:14px;padding:24px 28px;width:320px;box-shadow:0 8px 40px rgba(0,0,0,.2);}
.ops-structure .add-node-box h3{font-size:15px;font-weight:600;margin-bottom:16px;color:#2a3060;}
.ops-structure .add-node-box input{width:100%;border:1px solid #c0c8e0;border-radius:8px;padding:9px 12px;font-size:14px;outline:none;margin-bottom:8px;font-family:inherit;}
.ops-structure .add-node-box input:focus{border-color:#5060c0;}
.ops-structure .add-node-box label{font-size:12px;color:#6070a0;display:block;margin-bottom:4px;}
.ops-structure .add-node-box select{width:100%;border:1px solid #c0c8e0;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;margin-bottom:16px;font-family:inherit;background:#fff;}
.ops-structure .add-node-box select:focus{border-color:#5060c0;}
.ops-structure .add-node-btns{display:flex;gap:8px;justify-content:flex-end;}
.ops-structure .anb-cancel{background:#f0f2f8;border:1px solid #c0c8e0;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;color:#5060a0;}
.ops-structure .anb-ok{background:#4050c0;border:none;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;color:#fff;font-weight:500;}
.ops-structure .anb-ok:hover{background:#3040b0;}
`;

interface TreeNode { label: string; count: string | number; cls: string; children: TreeNode[]; }
interface Dept { id: string; label: string; pfx: string; roles: [string, string][]; tree?: TreeNode; }

export default function OpsStructure() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (id: string) => root.querySelector('#' + id) as HTMLElement | null;

    let DATA: Dept[] = [];
    let editMode = false;
    let currentDeptId: string | null = null;
    let pendingParentPath: { deptId: string; node: TreeNode } | null = null;
    let pendingCardDeptId: string | null = null;

    const accentMap: Record<string, string> = { cc: '#2a5090', py: '#5a3c10', su: '#3e38a0', af: '#6a2c14', bn: '#2e5014', rc: '#681e4a', ds: '#4a4844', cn: '#4a4844', cr: '#623a18', dl: '#1a4a80' };

    function g(roles: [string, string][], name: string): string {
      const r = roles.find((x) => x[0] === name);
      return r ? r[1] : '0';
    }
    function buildDefaultTree(id: string, roles: [string, string][]): TreeNode {
      const G = (n: string) => g(roles, n);
      if (id === 'cc') return { label: 'Head CC', count: G('Head CC'), cls: 'lv-head', children: [
        { label: 'Head SG', count: G('Head SG'), cls: 'lv-tl', children: [
          { label: 'TL Active', count: G('TL Active'), cls: 'lv-tl', children: [{ label: 'Manager Active', count: G('Manager Active'), cls: 'lv-mgr', children: [] }] },
          { label: 'TL Awol', count: G('TL Awol'), cls: 'lv-tl', children: [{ label: 'Manager Awol', count: G('Manager Awol'), cls: 'lv-mgr', children: [] }] },
          { label: 'QA TL', count: G('QA TL'), cls: 'lv-qa', children: [{ label: 'QA', count: G('QA'), cls: 'lv-qa', children: [] }] },
          { label: 'IVM Manager', count: G('IVM Manager'), cls: 'lv-dr', children: [] },
          { label: 'Coach', count: G('Coach'), cls: 'lv-dr', children: [] },
          { label: 'Statistician', count: G('Statistician'), cls: 'lv-dr', children: [] },
        ] },
        { label: 'Head NC', count: G('Head NC'), cls: 'lv-nk', children: [
          { label: 'TL NC', count: G('TL NC'), cls: 'lv-nk', children: [{ label: 'Manager NC', count: G('Manager NC'), cls: 'lv-nk', children: [] }] },
        ] },
      ] };
      if (id === 'py') return { label: 'Head', count: G('Head'), cls: 'lv-head', children: [
        { label: 'Supervisor SG', count: G('Supervisor SG'), cls: 'lv-sup', children: [
          { label: 'L1 SG', count: G('L1 SG'), cls: 'lv-mgr', children: [] },
          { label: 'L2 SG', count: G('L2 SG'), cls: 'lv-mgr', children: [] },
        ] },
        { label: 'Supervisor NC', count: G('Supervisor NC'), cls: 'lv-nk', children: [{ label: 'L2 NC', count: G('L2 NC'), cls: 'lv-nk', children: [] }] },
      ] };
      if (id === 'su') return { label: 'Head', count: G('Head'), cls: 'lv-head', children: [
        { label: 'TL SG', count: G('TL SG'), cls: 'lv-tl', children: [
          { label: 'Supervisor', count: G('Supervisor'), cls: 'lv-sup', children: [{ label: 'Sup. Manager', count: G('Sup. Manager'), cls: 'lv-mgr', children: [] }] },
          { label: 'VIP-Supervisor', count: G('VIP-Supervisor'), cls: 'lv-vip', children: [{ label: 'Support VIP', count: G('Support VIP'), cls: 'lv-vip', children: [] }] },
          { label: 'Coach', count: G('Coach'), cls: 'lv-dr', children: [] },
          { label: 'Complaints Mgr', count: G('Complaints Mgr'), cls: 'lv-dr', children: [] },
          { label: 'Analyst', count: G('Analyst'), cls: 'lv-dr', children: [] },
          { label: 'AI', count: G('AI'), cls: 'lv-dr', children: [] },
        ] },
        { label: 'TL NC', count: G('TL NC'), cls: 'lv-nk', children: [
          { label: 'Supervisor NC', count: G('Supervisor NC'), cls: 'lv-nk', children: [
            { label: 'Sup. Mgr NC', count: G('Sup. Mgr NC'), cls: 'lv-nk', children: [] },
            { label: 'VIP NC', count: G('VIP NC'), cls: 'lv-vip', children: [] },
          ] },
        ] },
        { label: 'QA TL', count: G('QA TL'), cls: 'lv-qa', children: [{ label: 'QA', count: G('QA'), cls: 'lv-qa', children: [] }] },
      ] };
      if (id === 'af') return { label: 'Head', count: G('Head'), cls: 'lv-head', children: [
        { label: 'TL SG', count: G('TL SG'), cls: 'lv-tl', children: [
          { label: 'Supervisor AF', count: G('Supervisor AF'), cls: 'lv-sup', children: [{ label: 'AF', count: G('AF'), cls: 'lv-mgr', children: [] }, { label: 'KYC', count: G('KYC'), cls: 'lv-mgr', children: [] }] },
          { label: 'Supervisor pay', count: G('Supervisor pay'), cls: 'lv-sup', children: [{ label: 'Pay. Manager', count: G('Pay. Manager'), cls: 'lv-mgr', children: [] }] },
          { label: 'Supervisor QA', count: G('Supervisor QA'), cls: 'lv-qa', children: [{ label: 'QA AF', count: G('QA AF'), cls: 'lv-qa', children: [] }] },
        ] },
        { label: 'TL NC', count: G('TL NC'), cls: 'lv-nk', children: [
          { label: 'Supervisor NC', count: G('Supervisor NC'), cls: 'lv-nk', children: [
            { label: 'AF NC', count: G('AF NC'), cls: 'lv-nk', children: [] },
            { label: 'QA NC', count: G('QA NC'), cls: 'lv-nk', children: [] },
            { label: 'Pay. Mgr NC', count: G('Pay. Mgr NC'), cls: 'lv-nk', children: [] },
            { label: 'KYC NC', count: G('KYC NC'), cls: 'lv-nk', children: [] },
          ] },
        ] },
      ] };
      if (id === 'bn') return { label: 'Head', count: G('Head'), cls: 'lv-head', children: [
        { label: 'TL SG', count: G('TL SG'), cls: 'lv-tl', children: [
          { label: 'Supervisor', count: G('Supervisor'), cls: 'lv-sup', children: [
            { label: 'Manager', count: G('Manager'), cls: 'lv-mgr', children: [] },
            { label: 'QA', count: G('QA'), cls: 'lv-qa', children: [] },
          ] },
        ] },
        { label: 'TL NC', count: G('TL NC'), cls: 'lv-nk', children: [{ label: 'Manager NC', count: G('Manager NC'), cls: 'lv-nk', children: [] }] },
      ] };
      if (id === 'rc') return { label: 'Head', count: G('Head'), cls: 'lv-head', children: [
        { label: 'Senior Recruiter', count: G('Senior Recruiter'), cls: 'lv-tl', children: [{ label: 'Recruiter', count: G('Recruiter'), cls: 'lv-mgr', children: [] }] },
      ] };
      if (id === 'ds') return { label: 'Team Lead', count: G('Team Lead'), cls: 'lv-head', children: [
        { label: 'Designer', count: G('Designer'), cls: 'lv-mgr', children: [] },
        { label: 'Motion Designer', count: G('Motion Designer'), cls: 'lv-mgr', children: [] },
      ] };
      if (id === 'cn') return { label: 'Head', count: G('Head'), cls: 'lv-head', children: [
        { label: 'Copywriter', count: G('Copywriter'), cls: 'lv-mgr', children: [] },
      ] };
      if (id === 'cr') return { label: 'CRM & Email', count: '—', cls: 'lv-head', children: [
        { label: 'Head CRM', count: G('Head CRM'), cls: 'lv-head', children: [
          { label: 'TL Promo', count: G('TL Promo'), cls: 'lv-tl', children: [
            { label: 'Supervisor Promo', count: G('Supervisor Promo'), cls: 'lv-sup', children: [
              { label: 'Mktg Promo', count: G('Marketing Mgr (Promo)'), cls: 'lv-mgr', children: [] },
              { label: 'Mktg mail.ru', count: G('Marketing Mgr (mail.ru)'), cls: 'lv-mgr', children: [] },
            ] },
          ] },
          { label: 'TL Trigger', count: G('TL Trigger'), cls: 'lv-tl', children: [
            { label: 'Supervisor Trigger', count: G('Supervisor Trigger'), cls: 'lv-sup', children: [
              { label: 'Mktg Trigger', count: G('Marketing Mgr (Trigger)'), cls: 'lv-mgr', children: [] },
            ] },
          ] },
          { label: 'Data Specialist', count: G('Data Specialist'), cls: 'lv-dr', children: [] },
          { label: 'Head Deliv.', count: G('Head Deliv.'), cls: 'lv-head', children: [
            { label: 'TL Deliv.', count: G('TL Deliv.'), cls: 'lv-tl', children: [
              { label: 'Supervisor Deliv.', count: G('Supervisor Deliv.'), cls: 'lv-sup', children: [
                { label: 'Manager Deliv.', count: G('Manager Deliv.'), cls: 'lv-mgr', children: [] },
              ] },
            ] },
          ] },
        ] },
      ] };
      if (id === 'dl') return { label: 'Head', count: G('Head'), cls: 'lv-head', children: [
        { label: 'TL', count: G('TL'), cls: 'lv-tl', children: [
          { label: 'Supervisor', count: G('Supervisor'), cls: 'lv-sup', children: [
            { label: 'Manager', count: G('Manager'), cls: 'lv-mgr', children: [] },
          ] },
        ] },
      ] };
      return { label: 'Отдел', count: '—', cls: 'lv-head', children: [] };
    }

    function ensureTree(d: Dept) { if (!d.tree) d.tree = buildDefaultTree(d.id, d.roles); }
    function escH(s: unknown) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function deptSum(d: Dept): string {
      let total = 0, sg = 0, nk = 0;
      d.roles.forEach((r) => {
        const n = parseFloat(r[1]); if (isNaN(n)) return;
        total += n;
        const name = r[0].toLowerCase();
        if (name.indexOf('nc') !== -1 || name.indexOf('nk') !== -1) nk += n; else sg += n;
      });
      const t = total % 1 === 0 ? String(total) : total.toFixed(1);
      if (sg > 0 && nk > 0) {
        const s = sg % 1 === 0 ? String(sg) : sg.toFixed(1);
        const k = nk % 1 === 0 ? String(nk) : nk.toFixed(1);
        return 'SG ' + s + ' / NC ' + k;
      }
      return t;
    }
    function recalcDept(d: Dept) { const el = root!.querySelector('.dept-col[data-id="' + d.id + '"] .dtotal'); if (el) el.textContent = deptSum(d); }
    function recalcFTE() {
      let total = 4;
      DATA.forEach((d) => d.roles.forEach((r) => { const n = parseFloat(r[1]); if (!isNaN(n)) total += n; }));
      const el = $('fteTotal'); if (el) el.textContent = total % 1 === 0 ? String(total) : total.toFixed(1);
    }
    function recalcAll() { DATA.forEach(recalcDept); recalcFTE(); }

    function renameTreeNode(node: TreeNode, oldName: string, newName: string) { if (node.label === oldName) node.label = newName; node.children?.forEach((c) => renameTreeNode(c, oldName, newName)); }
    function updateTreeNodeCount(node: TreeNode, name: string, count: string) { if (node.label === name) node.count = count; node.children?.forEach((c) => updateTreeNodeCount(c, name, count)); }
    function deleteTreeNode(node: TreeNode, label: string) { if (!node.children) return; node.children = node.children.filter((c) => c.label !== label); node.children.forEach((c) => deleteTreeNode(c, label)); }
    function findNodeByLabel(node: TreeNode, label: string): TreeNode | null {
      if (node.label === label) return node;
      if (node.children) for (const c of node.children) { const f = findNodeByLabel(c, label); if (f) return f; }
      return null;
    }

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    function showSaveStatus(msg: string, color: string) {
      const el = $('saveStatus'); if (!el) return;
      el.textContent = msg; el.style.color = color; el.style.opacity = '1';
      setTimeout(() => { el.style.opacity = '0'; }, 2500);
    }
    function saveToAPI() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        fetch(API_URL, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DATA) })
          .then((r) => { if (r.ok) showSaveStatus('✓ Сохранено', '#22c55e'); else showSaveStatus('✗ Ошибка', '#ef4444'); })
          .catch(() => showSaveStatus('✗ Нет связи', '#ef4444'));
      }, 800);
    }

    function saveEdit(el: HTMLElement) {
      const id = el.dataset.id!, field = el.dataset.field!, val = (el.textContent || '').trim();
      const d = DATA.find((x) => x.id === id); if (!d) return;
      if (field === 'label') { d.label = val; recalcAll(); saveToAPI(); }
      else if (field === 'rn') {
        const oldName = d.roles[+el.dataset.idx!][0];
        d.roles[+el.dataset.idx!][0] = val;
        if (d.tree) renameTreeNode(d.tree, oldName, val);
        saveToAPI();
      } else if (field === 'rc') {
        d.roles[+el.dataset.idx!][1] = val;
        if (d.tree) updateTreeNodeCount(d.tree, d.roles[+el.dataset.idx!][0], val);
        recalcAll(); saveToAPI();
      }
    }

    function render() {
      const grid = $('grid'); if (!grid) return;
      grid.innerHTML = '';
      DATA.forEach((d) => {
        const p = d.pfx;
        const col = document.createElement('div');
        col.className = 'dept-col'; col.dataset.id = d.id;
        const rolesHTML = d.roles.map((r, i) =>
          '<div class="role-row">' +
          '<span class="rn" contenteditable="false" data-field="rn" data-idx="' + i + '" data-id="' + d.id + '">' + escH(r[0]) + '</span>' +
          '<span class="rc ' + p + '-r" contenteditable="false" data-field="rc" data-idx="' + i + '" data-id="' + d.id + '">' + escH(r[1]) + '</span>' +
          '<button class="del-row" title="Удалить строку" data-act="del" data-id="' + d.id + '" data-idx="' + i + '">✕</button>' +
          '</div>').join('');
        col.innerHTML =
          '<div class="card ' + p + '-c">' +
          '<div class="card-head ' + p + '-h" data-act="head" data-id="' + d.id + '">' +
          '<span class="dname ' + p + '-n" contenteditable="false" data-field="label" data-id="' + d.id + '">' + escH(d.label) + '</span>' +
          '<span class="dtotal ' + p + '-t">' + deptSum(d) + '</span>' +
          '<span class="darr ' + p + '-t">▼</span>' +
          '</div>' +
          '<div class="card-body">' + rolesHTML + '<button class="add-row-btn" data-act="addrow" data-id="' + d.id + '">+ добавить позицию</button></div>' +
          '</div>' +
          '<button class="expand-btn" data-act="expand" data-id="' + d.id + '">⤢ детально</button>';
        grid.appendChild(col);
      });
      setTimeout(drawConnectors, 50);
      grid.querySelectorAll('[contenteditable]').forEach((el) => {
        const e = el as HTMLElement;
        e.addEventListener('blur', () => saveEdit(e));
        e.addEventListener('keydown', (ev) => { if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); e.blur(); } });
      });
      if (editMode) root!.querySelectorAll('[contenteditable]').forEach((el) => el.setAttribute('contenteditable', 'true'));
    }

    function headClick(e: Event, id: string) {
      if (editMode && (e.target as HTMLElement).hasAttribute('data-field')) return;
      const col = root!.querySelector('.dept-col[data-id="' + id + '"]');
      if (col) col.classList.toggle('open');
    }
    function delRow(id: string, idx: number) {
      const d = DATA.find((x) => x.id === id); if (!d) return;
      const roleName = d.roles[idx][0];
      d.roles.splice(idx, 1);
      if (d.tree) deleteTreeNode(d.tree, roleName);
      const wasOpen = root!.querySelector('.dept-col[data-id="' + id + '"]')?.classList.contains('open');
      render();
      if (wasOpen) root!.querySelector('.dept-col[data-id="' + id + '"]')?.classList.add('open');
      recalcAll(); saveToAPI();
    }
    function addRow(id: string) {
      const d = DATA.find((x) => x.id === id); if (!d) return;
      ensureTree(d);
      pendingParentPath = null; pendingCardDeptId = id;
      const sel = $('addNodeParent') as HTMLSelectElement; sel.innerHTML = '';
      sel.style.display = ''; ($('addNodeParentLabel') as HTMLElement).style.display = '';
      buildParentSelector(d.tree!, sel, '');
      ($('addNodeName') as HTMLInputElement).value = '';
      ($('addNodeCount') as HTMLInputElement).value = '1';
      ($('addNodeLevel') as HTMLSelectElement).value = 'lv-mgr';
      $('addNodeModal')!.classList.add('active');
      setTimeout(() => ($('addNodeName') as HTMLInputElement).focus(), 100);
    }
    function buildParentSelector(node: TreeNode, select: HTMLSelectElement, prefix: string) {
      const opt = document.createElement('option');
      opt.value = node.label; opt.textContent = prefix + node.label;
      select.appendChild(opt);
      node.children?.forEach((c) => buildParentSelector(c, select, prefix + '  '));
    }

    function openDeptTree(id: string) {
      const d = DATA.find((x) => x.id === id); if (!d) return;
      ensureTree(d);
      currentDeptId = id;
      $('suTitle')!.textContent = d.label + ' — структура отдела';
      $('suSub')!.textContent = deptSum(d) + ' чел. · нажми Esc или фон чтобы закрыть';
      ($('suPanel') as HTMLElement).style.borderColor = accentMap[id] || '#2e2888';
      renderTree(id);
      $('suOv')!.classList.add('active');
    }
    function closeSu() { $('suOv')!.classList.remove('active'); currentDeptId = null; }

    function renderTree(id: string) {
      const d = DATA.find((x) => x.id === id); if (!d || !d.tree) return;
      const container = $('suBody')!; container.innerHTML = '';
      const wrap = document.createElement('div'); wrap.className = 'tree-wrap';
      wrap.appendChild(buildTreeDOM(d.tree, id));
      container.appendChild(wrap);
    }
    function buildTreeDOM(node: TreeNode, deptId: string): HTMLElement {
      const wrap = document.createElement('div'); wrap.className = 'tree-node-wrap';
      const nodeRow = document.createElement('div'); nodeRow.className = 'tree-node';
      const box = document.createElement('div'); box.className = 'tree-node-box ' + (node.cls || 'lv-mgr');
      const titleEl = document.createElement('span'); titleEl.className = 'tn-title'; titleEl.textContent = node.label;
      if (editMode) {
        titleEl.contentEditable = 'true';
        titleEl.addEventListener('blur', () => {
          const oldName = node.label, newVal = (titleEl.textContent || '').trim();
          if (newVal && newVal !== oldName) {
            node.label = newVal;
            const d = DATA.find((x) => x.id === deptId);
            if (d) { const ri = d.roles.findIndex((r) => r[0] === oldName); if (ri >= 0) d.roles[ri][0] = newVal; recalcAll(); render(); if (currentDeptId) renderTree(currentDeptId); }
            saveToAPI();
          }
        });
        titleEl.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
      }
      const countEl = document.createElement('span'); countEl.className = 'tn-count'; countEl.textContent = String(node.count);
      if (editMode && node.count !== '—') {
        countEl.contentEditable = 'true';
        countEl.addEventListener('blur', () => {
          const newVal = (countEl.textContent || '').trim(); node.count = newVal;
          const d = DATA.find((x) => x.id === deptId);
          if (d) { const ri = d.roles.findIndex((r) => r[0] === node.label); if (ri >= 0) { d.roles[ri][1] = newVal; recalcAll(); render(); } saveToAPI(); }
        });
        countEl.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); countEl.blur(); } });
      }
      box.appendChild(titleEl); box.appendChild(countEl); nodeRow.appendChild(box);
      if (editMode) {
        const actions = document.createElement('div'); actions.className = 'tree-node-actions';
        const addBtn = document.createElement('button'); addBtn.className = 'tna-btn tna-add'; addBtn.title = 'Добавить дочерний узел'; addBtn.textContent = '+';
        addBtn.onclick = (e) => { e.stopPropagation(); pendingParentPath = { deptId, node }; openAddNodeModal(); };
        const delBtn = document.createElement('button'); delBtn.className = 'tna-btn tna-del'; delBtn.title = 'Удалить узел'; delBtn.textContent = '×';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (!confirm('Удалить узел "' + node.label + '" и всех его потомков?')) return;
          const d = DATA.find((x) => x.id === deptId);
          if (d) {
            const collectLabels = (n: TreeNode): string[] => { let labels = [n.label]; n.children?.forEach((c) => { labels = labels.concat(collectLabels(c)); }); return labels; };
            const toRemove = collectLabels(node);
            d.roles = d.roles.filter((r) => toRemove.indexOf(r[0]) === -1);
            deleteTreeNode(d.tree!, node.label);
            recalcAll(); render(); renderTree(deptId); saveToAPI();
          }
        };
        actions.appendChild(addBtn); actions.appendChild(delBtn); nodeRow.appendChild(actions);
      }
      wrap.appendChild(nodeRow);
      if (node.children && node.children.length > 0) {
        const vline = document.createElement('div'); vline.className = 'tree-v-line'; wrap.appendChild(vline);
        const hbar = document.createElement('div'); hbar.className = 'tree-h-bar';
        node.children.forEach((child) => {
          const col = document.createElement('div'); col.className = 'tree-child-col';
          const drop = document.createElement('div'); drop.className = 'tree-child-drop';
          col.appendChild(drop); col.appendChild(buildTreeDOM(child, deptId)); hbar.appendChild(col);
        });
        wrap.appendChild(hbar);
      }
      return wrap;
    }

    function openAddNodeModal() {
      ($('addNodeName') as HTMLInputElement).value = '';
      ($('addNodeCount') as HTMLInputElement).value = '1';
      ($('addNodeLevel') as HTMLSelectElement).value = 'lv-mgr';
      ($('addNodeParent') as HTMLElement).style.display = 'none';
      ($('addNodeParentLabel') as HTMLElement).style.display = 'none';
      $('addNodeModal')!.classList.add('active');
      setTimeout(() => ($('addNodeName') as HTMLInputElement).focus(), 100);
    }
    function closeAddNodeModal() { $('addNodeModal')!.classList.remove('active'); pendingParentPath = null; pendingCardDeptId = null; }
    function confirmAddNode() {
      const name = ($('addNodeName') as HTMLInputElement).value.trim();
      const count = ($('addNodeCount') as HTMLInputElement).value.trim() || '0';
      const cls = ($('addNodeLevel') as HTMLSelectElement).value;
      if (!name) { ($('addNodeName') as HTMLInputElement).focus(); return; }
      const deptId = pendingParentPath ? pendingParentPath.deptId : pendingCardDeptId;
      if (!deptId) return;
      const d = DATA.find((x) => x.id === deptId); if (!d) return;
      ensureTree(d);
      let parentNode: TreeNode;
      if (pendingParentPath) parentNode = pendingParentPath.node;
      else {
        const parentLabel = ($('addNodeParent') as HTMLSelectElement).value;
        parentNode = findNodeByLabel(d.tree!, parentLabel) || d.tree!;
      }
      const newNode: TreeNode = { label: name, count, cls, children: [] };
      if (!parentNode.children) parentNode.children = [];
      parentNode.children.push(newNode);
      d.roles.push([name, count]);
      recalcAll(); render();
      if (pendingCardDeptId) root!.querySelector('.dept-col[data-id="' + deptId + '"]')?.classList.add('open');
      closeAddNodeModal();
      if (currentDeptId === deptId) renderTree(deptId);
      saveToAPI();
    }

    function toggleEdit() {
      editMode = !editMode;
      root!.classList.toggle('editing', editMode);
      const btn = $('editBtn')!, hint = $('editHint')!;
      if (editMode) {
        btn.classList.add('edit-on'); btn.textContent = '✓ Готово';
        hint.textContent = 'Кликни на текст чтобы изменить · + добавить позицию · ✕ удалить · В дереве: + добавить дочерний узел';
        root!.querySelectorAll('[contenteditable]').forEach((el) => el.setAttribute('contenteditable', 'true'));
      } else {
        btn.classList.remove('edit-on'); btn.textContent = '✎ Редактировать'; hint.textContent = '';
        root!.querySelectorAll('[contenteditable]').forEach((el) => el.setAttribute('contenteditable', 'false'));
      }
      if (currentDeptId) renderTree(currentDeptId);
    }

    function drawConnectors() {
      const wrap = $('connectorWrap'), head = $('headNode'), grid = $('grid');
      if (!wrap || !head || !grid) return;
      const cols = grid.querySelectorAll('.dept-col'); if (!cols.length) return;
      const wRect = wrap.getBoundingClientRect(), headRect = head.getBoundingClientRect();
      const headCX = headRect.left + headRect.width / 2 - wRect.left;
      const deptCXs = Array.from(cols).map((col) => { const r = col.getBoundingClientRect(); return r.left + r.width / 2 - wRect.left; });
      const firstX = deptCXs[0], lastX = deptCXs[deptCXs.length - 1];
      const stemH = 24, barY = stemH, svgH = stemH + 18;
      const svgW = Math.max(lastX + 10, headCX + 10);
      const dept_colors = ['#6090d0', '#c09040', '#8080d0', '#c06040', '#60a040', '#c060a0', '#909090', '#909090', '#b07040', '#3070b0'];
      let lines = '';
      lines += '<line x1="' + headCX + '" y1="0" x2="' + headCX + '" y2="' + barY + '" stroke="#b0b8d8" stroke-width="1"/>';
      lines += '<line x1="' + firstX + '" y1="' + barY + '" x2="' + lastX + '" y2="' + barY + '" stroke="#b0b8d8" stroke-width="1"/>';
      deptCXs.forEach((cx, i) => { lines += '<line x1="' + cx + '" y1="' + barY + '" x2="' + cx + '" y2="' + svgH + '" stroke="' + (dept_colors[i] || '#b0b8d8') + '" stroke-width="1.5"/>'; });
      wrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgW + '" height="' + svgH + '" style="display:block;width:100%;height:' + svgH + 'px;overflow:visible;">' + lines + '</svg>';
    }

    // delegated clicks for dynamically rendered grid elements
    const onGridClick = (e: Event) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.act, id = t.dataset.id!;
      if (act === 'head') headClick(e, id);
      else if (act === 'expand') openDeptTree(id);
      else if (act === 'addrow') addRow(id);
      else if (act === 'del') delRow(id, +t.dataset.idx!);
    };
    root.addEventListener('click', onGridClick);

    $('editBtn')?.addEventListener('click', toggleEdit);
    $('suCloseBtn')?.addEventListener('click', closeSu);
    $('anbCancel')?.addEventListener('click', closeAddNodeModal);
    $('anbOk')?.addEventListener('click', confirmAddNode);
    const suOv = $('suOv'); const onOvClick = (e: Event) => { if (e.target === e.currentTarget) closeSu(); }; suOv?.addEventListener('click', onOvClick);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { closeSu(); closeAddNodeModal(); } };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', drawConnectors);

    fetch(API_URL, { credentials: 'include' })
      .then((r) => r.json())
      .then((json: Dept[]) => {
        DATA = json.filter((d) => d.id !== 'pv');
        const crDept = DATA.find((d) => d.id === 'cr');
        if (crDept) {
          const headCrmRole = crDept.roles.find((r) => r[0] === 'Head CRM');
          if (!headCrmRole) crDept.roles.unshift(['Head CRM', '1']);
          else if (isNaN(parseFloat(headCrmRole[1]))) headCrmRole[1] = '1';
        }
        if (!DATA.find((d) => d.id === 'dl')) DATA.push({ id: 'dl', label: 'Deliverability', pfx: 'dl', roles: [['Head', '1'], ['TL', '1'], ['Supervisor', '1'], ['Manager', '4']] });
        render(); recalcAll(); setTimeout(drawConnectors, 120);
      })
      .catch(() => { render(); recalcAll(); setTimeout(drawConnectors, 120); });

    return () => {
      root.removeEventListener('click', onGridClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', drawConnectors);
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, []);

  return (
    <div className="ops-structure" ref={rootRef}>
      <style>{CSS}</style>
      <BackButton to="/ops" />
      <div dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
    </div>
  );
}
