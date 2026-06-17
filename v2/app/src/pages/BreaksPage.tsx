import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import './breaks.css';

// ── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://rteemqmqwhcgjuvqtlhz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fvme3q6CpvhlRiTMHKkapg_y8_EL17v';

const MAX_BREAKS = 4;
const MAX_LUNCHES = 1;

const ADMINS = new Set([
  'maksym.max@velvix.org',
  'ruslan.irving@velvix.org',
  'vitaliy.oliver@velvix.org',
  'ayman.jordan@velvix.org',
  'nataliia.naomi@velvix.org',
  'viktor.matthew@velvix.org',
  'kirill.curtis@velvix.org',
  'ruslan.manuel@velvix.org',
  'janelle.irma@velvix.org',
  'ilia.solomon@velvix.org',
  'osman.toby@velvix.org',
  'vadym.adam@velvix.org',
  'tamila.amelia@velvix.org',
  'vladimir.lucas@velvix.org',
  'maksym.reggie@velvix.org',
]);

// ── Operators ─────────────────────────────────────────────────────────────────

const DEFAULT_OPERATORS = {
  sg: {
    regular: ['Balfour','Bill','Bob','Bowen','Bridget','Calvin','Charles','Colin','Earl','Fletcher','Florence','Gross','Hardy','Jonathan','Joseph','Kenzo','Lex','Meadow','Mike','Murphy','Nora','Norman','Robert','Robin','Rudy','Sherlock','Will'],
    vip:     ['Alexia','Ashton','Casper','Chadwick','Christine','Denzel','Elijah','Fabio','Felicia','Holly','Isaac','Kiana','Morgan','Nolan','Plover','Reggie','River','Scott','Simon','Skylar','Tom','Trinity','Wade','Warren'],
  },
  nc: {
    regular: ['Caleb','Grant','Shin','Frey','Luciana','Hector','Max','Leo','Debra','Quinn','Evelyn','Taylor','Ren'],
  },
};

// ── Shift configs ─────────────────────────────────────────────────────────────

type BreakGroup = { label: string; hh: string; slots: string[] };
type ShiftCfg   = { breakGroups: BreakGroup[]; lunchHours: number[] | null; crossShift: string | null };

function makeBreakGroups(hours: number[]): BreakGroup[] {
  return hours.map(h => {
    const hh = String(h).padStart(2, '0');
    return { label: hh + ':xx', hh, slots: [hh+':10', hh+':20', hh+':30', hh+':40'] };
  });
}

function makeLunchSlots(hours: number[] | null): string[] {
  if (!hours) return [];
  return hours.map(h => String(h).padStart(2, '0') + ':00');
}

const NIGHT_BREAK_GROUPS: BreakGroup[] = [
  { label:'22:xx', hh:'22', slots:['22:10','22:40'] },
  { label:'23:xx', hh:'23', slots:['23:10','23:40'] },
  { label:'00:xx', hh:'00', slots:['00:10','00:40'] },
  { label:'01:xx', hh:'01', slots:['01:10','01:40'] },
  { label:'02:xx', hh:'02', slots:['02:10','02:20','02:30','02:40'] },
  { label:'03:xx', hh:'03', slots:['03:10','03:20','03:30','03:40'] },
  { label:'04:xx', hh:'04', slots:['04:10','04:20','04:30','04:40'] },
  { label:'05:xx', hh:'05', slots:['05:10','05:20','05:30','05:40'] },
  { label:'06:xx', hh:'06', slots:['06:10','06:40'] },
  { label:'07:xx', hh:'07', slots:['07:10','07:40'] },
  { label:'08:xx', hh:'08', slots:['08:00','08:10','08:20'] },
];

const SHIFT_CFG: Record<string, ShiftCfg> = {
  '9-21': {
    breakGroups: [
      { label:'10:xx', hh:'10', slots:['10:10','10:40'] },
      { label:'11:xx', hh:'11', slots:['11:10','11:40'] },
      ...makeBreakGroups([12,13,14,15,16,17,19]),
      { label:'20:xx', hh:'20', slots:['20:00','20:10','20:20'] },
    ],
    lunchHours: [12,13,14,15,16,17,18,19],
    crossShift: null,
  },
  '12-24': {
    breakGroups: makeBreakGroups([13,14,15,16,17,18,19,20,21,22]),
    lunchHours: [20,21,22],
    crossShift: null,
  },
  'night': {
    breakGroups: NIGHT_BREAK_GROUPS,
    lunchHours: [1,2,3,4,5,6,7],
    crossShift: '12-24',
  },
};

function makeNCBreakGroups(hours: number[]): BreakGroup[] {
  return hours.map(h => {
    const hh = String(h).padStart(2, '0');
    return { label: hh + ':xx', hh, slots: [hh+':10', hh+':40'] };
  });
}

const NC_NIGHT_BREAK_GROUPS: BreakGroup[] = [
  { label:'22:xx', hh:'22', slots:['22:10','22:40'] },
  { label:'23:xx', hh:'23', slots:['23:10','23:40'] },
  { label:'00:xx', hh:'00', slots:['00:10','00:40'] },
  { label:'01:xx', hh:'01', slots:['01:10','01:40'] },
  { label:'02:xx', hh:'02', slots:['02:10','02:40'] },
  { label:'03:xx', hh:'03', slots:['03:10','03:40'] },
  { label:'04:xx', hh:'04', slots:['04:10','04:40'] },
  { label:'05:xx', hh:'05', slots:['05:10','05:40'] },
  { label:'06:xx', hh:'06', slots:['06:10','06:40'] },
  { label:'07:xx', hh:'07', slots:['07:10','07:40'] },
];

const NC_SHIFT_CFG: Record<string, ShiftCfg> = {
  '9-21':  { breakGroups: makeNCBreakGroups([10,11,12,13,14,15,16,17,19]), lunchHours: [12,13,14,15,16,17,18,19], crossShift: null },
  '12-24': { breakGroups: makeNCBreakGroups([13,14,15,16,17,18,19,21,22]), lunchHours: [20,21,22],                 crossShift: null },
  'night': { breakGroups: NC_NIGHT_BREAK_GROUPS,                           lunchHours: [1,2,3,4,5,6,7],           crossShift: null },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sbFetch(path: string, opts: RequestInit & { prefer?: string } = {}) {
  const { prefer, headers: extraHeaders, ...rest } = opts as RequestInit & { prefer?: string };
  return fetch(SUPABASE_URL + path, {
    ...rest,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': prefer ?? '',
      ...(extraHeaders as Record<string, string> || {}),
    },
  });
}

function kyivNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kiev' }));
}

function kyivMinutes() {
  const d = kyivNow();
  return d.getHours() * 60 + d.getMinutes();
}

function shiftBookingAllowed(shiftId: string): boolean {
  const now = kyivMinutes();
  if (shiftId === '9-21')  return now >= 8*60+45  && now < 21*60+5;
  if (shiftId === '12-24') return now >= 11*60+45 && now < 24*60+5;
  if (shiftId === 'night') return now >= 20*60+45 || now < 9*60+5;
  return true;
}

function toMin(time: string, shiftId: string): number {
  const [h, m] = time.split(':').map(Number);
  let total = h * 60 + m;
  if (shiftId === 'night' && h < 12) total += 24 * 60;
  return total;
}

function getTransferExpiresAt(forShift: 'night' | 'day'): string {
  const now = new Date();
  const kyiv = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kiev' }));
  const expire = new Date(kyiv);
  if (forShift === 'night') {
    expire.setDate(expire.getDate() + 1);
    expire.setHours(9, 0, 0, 0);
  } else {
    expire.setDate(expire.getDate() + 1);
    expire.setHours(0, 0, 0, 0);
  }
  const offsetMs = kyiv.getTime() - now.getTime();
  return new Date(expire.getTime() - offsetMs).toISOString();
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SyncState = 'connecting' | 'online' | 'saving' | 'offline';
type Section   = 'sg' | 'nc';
type Dept      = 'regular' | 'vip';
type ShiftType = 'day' | 'night';
type ShiftId   = '9-21' | '12-24' | 'night';

interface Transfer {
  id: number;
  operator: string;
  from_section: string;
  from_dept: string;
  to_section: string;
  to_dept: string;
  expires_at: string;
}

interface LogEntry {
  id: number;
  time_kyiv: string;
  section: string;
  dept: string;
  shift: string;
  operator: string;
  user_email: string;
  action: string;
  slot: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BreaksPage() {
  // ── auth ──
  const { data: authData } = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const r = await fetch('/api/check', { credentials: 'include' });
      if (!r.ok) return null;
      return r.json() as Promise<{ ok: boolean; email: string; role: string }>;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const userEmail = authData?.email?.toLowerCase() ?? '';

  // ── UI state ──
  const [section,   setSection]   = useState<Section>('sg');
  const [dept,      setDept]      = useState<Dept>('regular');
  const [shiftType, setShiftType] = useState<ShiftType>('day');
  const [shiftId,   setShiftId]   = useState<ShiftId>('9-21');
  const [currentOp, setCurrentOp] = useState('');

  // ── Operators (mutable from roster) ──
  const [operators, setOperators] = useState(DEFAULT_OPERATORS);

  // ── Bookings ──
  const [bookings, setBookings] = useState<Record<string, string>>({});

  // ── Transfers ──
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  // ── Sync ──
  const [syncState, setSyncState] = useState<SyncState>('connecting');

  // ── Panels ──
  const [logOpen,   setLogOpen]   = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTab,  setAdminTab]  = useState<'transfer' | 'roster'>('transfer');
  const [logDayOffset, setLogDayOffset] = useState(0);
  const [logEntries,   setLogEntries]   = useState<LogEntry[] | null>(null);
  const [logLoading,   setLogLoading]   = useState(false);

  // ── Op Pick modal ──
  const [opPickOpen, setOpPickOpen]   = useState(false);
  const [opPickCb,   setOpPickCb]     = useState<((name: string) => void) | null>(null);
  const [opPickSel,  setOpPickSel]    = useState('');

  // ── Notifications ──
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifAhead,   setNotifAhead]   = useState(2);
  const firedNotifs = useRef(new Set<string>());
  const notifTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Realtime ──
  const realtimeConnectedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  // ── Roster add input refs ──
  const [rosterInputs, setRosterInputs] = useState<Record<string, string>>({});

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isAdminUser = ADMINS.has(userEmail);
  const isAdmin     = isAdminUser && !currentOp;
  const accentMode  = shiftType === 'night' ? 'night' : 'day';

  function getEffectiveOperators(sec: Section, d: Dept): string[] {
    let base: string[];
    if (sec === 'nc') base = [...operators.nc.regular];
    else base = [...operators.sg[d as 'regular' | 'vip']];

    transfers.forEach(t => {
      if (t.to_section === sec && t.to_dept === d && !base.includes(t.operator)) {
        base.push(t.operator);
      }
    });
    transfers.forEach(t => {
      if (t.from_section === sec && t.from_dept === d) {
        base = base.filter(n => n !== t.operator);
      }
    });
    return base.sort();
  }

  const currentOpList = useMemo(() => getEffectiveOperators(section, dept), [section, dept, operators, transfers]);

  const cfg: ShiftCfg = (section === 'nc' ? NC_SHIFT_CFG : SHIFT_CFG)[shiftId];

  function bKey(sid: string, time: string) { return section + '|' + dept + '|' + sid + '|b|' + time; }
  function lKey(sid: string, time: string) { return section + '|' + dept + '|' + sid + '|l|' + time; }

  function getSlotOccupants(baseKey: string): { key: string; name: string }[] {
    const result: { key: string; name: string }[] = [];
    if (bookings[baseKey]) result.push({ key: baseKey, name: bookings[baseKey] });
    let i = 1;
    while (bookings[baseKey + '|' + i]) {
      result.push({ key: baseKey + '|' + i, name: bookings[baseKey + '|' + i] });
      i++;
      if (i > 10) break;
    }
    return result;
  }

  function myBreaksCount() {
    return Object.entries(bookings).filter(([k, v]) =>
      k.startsWith(section + '|' + dept + '|' + shiftId + '|b|') && v === currentOp
    ).length;
  }

  function myLunchCount() {
    return Object.entries(bookings).filter(([k, v]) =>
      k.startsWith(section + '|' + dept + '|' + shiftId + '|l|') && v === currentOp
    ).length;
  }

  function closestMyBookingDistance(time: string): number | null {
    const prefix = section + '|' + dept + '|' + shiftId + '|';
    const myTimes = Object.entries(bookings)
      .filter(([k, v]) => v === currentOp && (k.startsWith(prefix + 'b|') || k.startsWith(prefix + 'l|')))
      .map(([k]) => k.includes('|b|') ? k.split('|b|')[1] : k.split('|l|')[1]);
    if (!myTimes.length) return null;
    const t = toMin(time, shiftId);
    return Math.min(...myTimes.map(bt => Math.abs(toMin(bt, shiftId) - t)));
  }

  function tooClose(time: string): boolean {
    const dist = closestMyBookingDistance(time);
    return dist !== null && dist < 60;
  }

  function allBreakSlots(): string[] {
    return cfg.breakGroups.reduce((arr: string[], g) => arr.concat(g.slots), []);
  }

  function crossBlockedBy(time: string): string | null {
    const crossMap: Record<string, string> = { '9-21': '12-24', '12-24': '9-21' };
    const cross = crossMap[shiftId];
    if (!cross) return null;
    const crossKey = section + '|' + dept + '|' + cross + '|b|' + time;
    return bookings[crossKey] || null;
  }

  function noValidSlotsLeft(): boolean {
    if (!currentOp) return false;
    const mb = myBreaksCount();
    if (mb >= MAX_BREAKS) return false;
    return allBreakSlots().every(time => {
      const k = bKey(shiftId, time);
      const occupants = getSlotOccupants(k);
      if (occupants.length > 0) return true;
      if (crossBlockedBy(time)) return true;
      if (!tooClose(time)) return false;
      return true;
    });
  }

  // ── Supabase / data ───────────────────────────────────────────────────────────

  function refreshBookings() {
    sbFetch('/rest/v1/bookings?select=key,value')
      .then(r => r.json())
      .then((rows: { key: string; value: string }[]) => {
        const b: Record<string, string> = {};
        (rows || []).forEach(r => { b[r.key] = r.value; });
        setBookings(b);
        setSyncState('online');
      })
      .catch(() => setSyncState('offline'));
  }

  async function loadTransfersData() {
    try {
      const r = await sbFetch('/rest/v1/transfers?select=*&expires_at=gt.' + new Date().toISOString() + '&order=id.asc');
      const rows = await r.json();
      setTransfers(Array.isArray(rows) ? rows : []);
    } catch {
      setTransfers([]);
    }
  }

  async function loadRosterData() {
    try {
      const r = await sbFetch('/rest/v1/roster?select=section,dept,names');
      const rows: { section: string; dept: string; names: string[] }[] = await r.json();
      if (!Array.isArray(rows) || rows.length === 0) return;
      setOperators(prev => {
        const next = { ...prev, sg: { ...prev.sg }, nc: { ...prev.nc } };
        rows.forEach(row => {
          if (row.section === 'sg' && row.dept === 'regular') next.sg.regular = row.names;
          if (row.section === 'sg' && row.dept === 'vip')     next.sg.vip     = row.names;
          if (row.section === 'nc' && row.dept === 'regular') next.nc.regular = row.names;
        });
        return next;
      });
    } catch { /* ignore */ }
  }

  async function saveRosterData(ops: typeof operators) {
    const rows = [
      { section: 'sg', dept: 'regular', names: ops.sg.regular },
      { section: 'sg', dept: 'vip',     names: ops.sg.vip },
      { section: 'nc', dept: 'regular', names: ops.nc.regular },
    ];
    await Promise.all(rows.map(row =>
      sbFetch('/rest/v1/roster?section=eq.' + row.section + '&dept=eq.' + row.dept, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ names: row.names }),
      })
    ));
  }

  function logAction(action: string, slot: string, overrideOp?: string) {
    const logOperator = overrideOp || currentOp || '(admin)';
    const kyiv = kyivNow();
    const kyivTime = kyiv.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const logDate = new Date(kyiv);
    if (shiftId === 'night' && kyiv.getHours() < 9) logDate.setDate(logDate.getDate() - 1);
    const shiftDate = logDate.toISOString().slice(0, 10);

    sbFetch('/rest/v1/logs', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        shift_date: shiftDate,
        time_kyiv: kyivTime,
        section,
        dept,
        shift: shiftId,
        operator: logOperator,
        user_email: userEmail,
        action,
        slot,
      }),
    }).catch(() => {});
  }

  // ── Compact slot keys ──

  function compactSlotKeys(bks: Record<string, string>, baseKey: string): Record<string, string> {
    const next = { ...bks };
    const names: string[] = [];
    if (next[baseKey]) names.push(next[baseKey]);
    let i = 1;
    while (next[baseKey + '|' + i] !== undefined) {
      if (next[baseKey + '|' + i]) names.push(next[baseKey + '|' + i]);
      delete next[baseKey + '|' + i];
      i++;
    }
    if (names.length > 0) next[baseKey] = names[0];
    else delete next[baseKey];
    for (let j = 1; j < names.length; j++) {
      next[baseKey + '|' + j] = names[j];
    }
    return next;
  }

  // ── Atomic book / cancel ──

  function atomicBook(key: string, value: string, slotLabel: string, adminForce: boolean) {
    setSyncState('saving');

    if (adminForce) {
      const baseKey = key.replace(/\|\d+$/, '');
      let writeKey = baseKey;
      let idx = 1;
      setBookings(prev => {
        const bks = { ...prev };
        while (bks[writeKey] && bks[writeKey] !== value) {
          writeKey = baseKey + '|' + idx;
          idx++;
          if (idx > 10) break;
        }
        bks[writeKey] = value;
        return bks;
      });
      const finalKey = writeKey; // capture for async
      sbFetch('/rest/v1/bookings', {
        method: 'POST',
        prefer: 'return=minimal,resolution=merge-duplicates',
        body: JSON.stringify({ key: finalKey, value }),
      })
        .then(r => {
          if (r.ok) setSyncState('online');
          else { setBookings(prev => { const n = { ...prev }; delete n[finalKey]; return n; }); setSyncState('offline'); }
        })
        .catch(() => {
          setBookings(prev => { const n = { ...prev }; delete n[finalKey]; return n; });
          setSyncState('offline');
        });
      return;
    }

    // Regular user — optimistic
    const prev = bookings[key];
    setBookings(bks => ({ ...bks, [key]: value }));

    sbFetch('/rest/v1/bookings', {
      method: 'POST',
      prefer: 'return=representation,resolution=ignore-duplicates',
      body: JSON.stringify({ key, value }),
    })
      .then(r => r.json())
      .then((rows: unknown[]) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setSyncState('online');
        } else {
          // Conflict — rollback
          setBookings(bks => {
            const n = { ...bks };
            if (prev !== undefined) n[key] = prev; else delete n[key];
            return n;
          });
          setSyncState('online');
          sbFetch('/rest/v1/bookings?key=eq.' + encodeURIComponent(key) + '&select=value')
            .then(r => r.json())
            .then((r: { value: string }[]) => {
              const who = (r[0] && r[0].value) || 'другой оператор';
              refreshBookings();
              showConflictToast(slotLabel, who);
            });
        }
      })
      .catch(() => {
        setBookings(bks => {
          const n = { ...bks };
          if (prev !== undefined) n[key] = prev; else delete n[key];
          return n;
        });
        setSyncState('offline');
        alert('Ошибка сети — попробуйте ещё раз');
      });
  }

  function atomicCancel(key: string, value: string, slotLabel: string, adminForce: boolean) {
    const savedVal = bookings[key];
    const baseKey = key.replace(/\|\d+$/, '');
    setBookings(prev => {
      const n = { ...prev };
      delete n[key];
      return compactSlotKeys(n, baseKey);
    });
    setSyncState('saving');

    const filter = adminForce
      ? '?key=eq.' + encodeURIComponent(key)
      : '?key=eq.' + encodeURIComponent(key) + '&value=eq.' + encodeURIComponent(value);

    sbFetch('/rest/v1/bookings' + filter, { method: 'DELETE', prefer: 'return=minimal' })
      .then(r => {
        if (r.ok) { setSyncState('online'); refreshBookings(); }
        else {
          setBookings(prev => savedVal !== undefined ? { ...prev, [key]: savedVal } : prev);
          setSyncState('offline');
        }
      })
      .catch(() => {
        setBookings(prev => savedVal !== undefined ? { ...prev, [key]: savedVal } : prev);
        setSyncState('offline');
      });
  }

  // ── Booking actions ──

  function bookBreak(time: string, forceOverride = false) {
    if (!currentOp) { alert('Выберите оператора'); return; }
    if (!isAdmin && !shiftBookingAllowed(shiftId)) {
      const labels: Record<string, string> = { '9-21': '08:45', '12-24': '11:45', 'night': '20:45' };
      alert('Бронирование открывается в ' + (labels[shiftId] || '') + ' по Киеву');
      return;
    }
    if (!isAdmin) {
      if (crossBlockedBy(time)) { alert('Слот ' + time + ' занят оператором смежной смены'); return; }
      if (myBreaksCount() >= MAX_BREAKS) { alert('Лимит: 4 перерыва на смену'); return; }
      if (tooClose(time) && !forceOverride) { alert('Между перерывами должен быть минимум 1 час'); return; }
    }
    logAction('book_break', time);
    atomicBook(bKey(shiftId, time), currentOp, time, isAdmin);
  }

  function cancelBreak(time: string) {
    const baseKey = bKey(shiftId, time);
    const occupants = getSlotOccupants(baseKey);
    const myEntry = occupants.find(o => o.name === currentOp);
    if (myEntry) {
      logAction('cancel_break', time);
      atomicCancel(myEntry.key, currentOp, time, false);
    }
  }

  function adminCancelBreak(fullKey: string) {
    const who = bookings[fullKey];
    if (!who) return;
    logAction('cancel_break', fullKey.split('|b|')[1] || fullKey, who);
    atomicCancel(fullKey, who, fullKey.split('|b|')[1] || fullKey, true);
  }

  function bookLunch(time: string) {
    if (!currentOp) { alert('Выберите оператора'); return; }
    if (!isAdmin && !shiftBookingAllowed(shiftId)) {
      const labels: Record<string, string> = { '9-21': '08:45', '12-24': '11:45', 'night': '20:45' };
      alert('Бронирование открывается в ' + (labels[shiftId] || '') + ' по Киеву');
      return;
    }
    if (!isAdmin) {
      if (myLunchCount() >= MAX_LUNCHES) { alert('Обед уже забронирован'); return; }
      if (tooClose(time)) { alert('Между перерывами и обедом должен быть минимум 1 час'); return; }
    }
    logAction('book_lunch', time + ' обед');
    atomicBook(lKey(shiftId, time), currentOp, time + ' обед', isAdmin);
  }

  function cancelLunch(time: string) {
    const baseKey = lKey(shiftId, time);
    const occupants = getSlotOccupants(baseKey);
    const myEntry = occupants.find(o => o.name === currentOp);
    if (myEntry) {
      logAction('cancel_lunch', time + ' обед');
      atomicCancel(myEntry.key, currentOp, time + ' обед', false);
    }
  }

  function adminCancelLunch(fullKey: string) {
    const who = bookings[fullKey];
    if (!who) return;
    const slot = (fullKey.split('|l|')[1] || fullKey) + ' обед';
    logAction('cancel_lunch', slot, who);
    atomicCancel(fullKey, who, slot, true);
  }

  function adminBook(type: 'break' | 'lunch', time: string) {
    const doBook = (name: string) => {
      const baseKey = type === 'break' ? bKey(shiftId, time) : lKey(shiftId, time);
      const slotLabel = time + (type === 'lunch' ? ' обед' : '');
      logAction(type === 'break' ? 'book_break' : 'book_lunch', slotLabel, name);
      atomicBook(baseKey, name, slotLabel, true);
    };
    if (currentOp) {
      doBook(currentOp);
    } else {
      setOpPickSel(currentOpList[0] || '');
      setOpPickCb(() => doBook);
      setOpPickOpen(true);
    }
  }

  // ── Conflict toast ──

  function showConflictToast(slot: string, who: string) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#f87171;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;' +
      'font-family:DM Mono,monospace;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4);white-space:nowrap';
    toast.textContent = '✕ Слот ' + slot + ' уже занял ' + who + ' — страница обновлена';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ── Realtime ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    setSyncState('connecting');

    // Initial load
    sbFetch('/rest/v1/bookings?select=key,value')
      .then(r => r.json())
      .then(async (rows: { key: string; value: string }[]) => {
        const b: Record<string, string> = {};
        (rows || []).forEach(r => { b[r.key] = r.value; });
        setBookings(b);
        await loadTransfersData();
        await loadRosterData();
        setSyncState('online');
      })
      .catch(() => setSyncState('offline'));

    // Realtime WebSocket
    const wsUrl = SUPABASE_URL.replace('https://', 'wss://') +
      '/realtime/v1/websocket?apikey=' + SUPABASE_KEY + '&vsn=1.0.0';

    let heartbeat: ReturnType<typeof setInterval>;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        realtimeConnectedRef.current = true;
        setSyncState('online');
        ws.send(JSON.stringify({
          topic: 'realtime:public:bookings',
          event: 'phx_join',
          payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
          ref: '1',
        }));
        heartbeat = setInterval(() => {
          ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '0' }));
        }, 20000);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
          const row = msg.payload?.record || msg.payload?.old_record;
          if (!row) return;
          if (msg.event === 'DELETE') {
            setBookings(prev => { const n = { ...prev }; delete n[row.key]; return n; });
          } else {
            setBookings(prev => ({ ...prev, [row.key]: row.value }));
          }
          loadTransfersData();
        }
      };

      ws.onclose = () => {
        realtimeConnectedRef.current = false;
        clearInterval(heartbeat);
        if (!destroyed) {
          setSyncState('offline');
          reconnectTimer = setTimeout(() => { setSyncState('connecting'); connect(); }, 3000);
        }
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    // Fallback poll
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (realtimeConnectedRef.current) return;
      sbFetch('/rest/v1/bookings?select=key,value')
        .then(r => r.json())
        .then((rows: { key: string; value: string }[]) => {
          const b: Record<string, string> = {};
          (rows || []).forEach(r => { b[r.key] = r.value; });
          setBookings(b);
          loadTransfersData();
        })
        .catch(() => {});
    }, 30000);

    return () => {
      destroyed = true;
      clearInterval(heartbeat!);
      clearInterval(poll);
      clearTimeout(reconnectTimer!);
      wsRef.current?.close();
    };
  }, []);

  // ── Notifications ──────────────────────────────────────────────────────────

  const checkUpcomingBookings = useCallback(() => {
    if (!notifEnabled || !currentOp) return;
    const kyiv = kyivNow();
    const nowMin = kyiv.getHours() * 60 + kyiv.getMinutes();
    const prefix = section + '|' + dept + '|' + shiftId + '|';

    Object.entries(bookings).forEach(([k, v]) => {
      if (v !== currentOp) return;
      const isBreak = k.startsWith(prefix + 'b|');
      const isLunch = k.startsWith(prefix + 'l|');
      if (!isBreak && !isLunch) return;
      const timeStr = isBreak ? k.split('|b|')[1] : k.split('|l|')[1];
      if (!timeStr) return;
      const [hh, mm] = timeStr.split(':').map(Number);
      let slotMin = hh * 60 + mm;
      if (shiftId === 'night' && hh < 12) slotMin += 24 * 60;
      const diff = slotMin - nowMin;
      const notifKey = k;
      if (diff > 0 && diff <= notifAhead && !firedNotifs.current.has(notifKey)) {
        firedNotifs.current.add(notifKey);
        const typeLabel = isBreak ? 'Перерыв' : 'Обед';
        new Notification(`☕ ${typeLabel} через ${diff} мин`, {
          body: `${currentOp} · ${timeStr} · смена ${shiftId === '9-21' ? '09–21' : shiftId === '12-24' ? '12–00' : 'Ночь'} · за ${notifAhead} мин`,
          tag: notifKey,
        });
      }
      if (diff < -5) firedNotifs.current.delete(notifKey);
    });
  }, [notifEnabled, currentOp, bookings, section, dept, shiftId, notifAhead]);

  useEffect(() => {
    if (notifEnabled) {
      checkUpcomingBookings();
      notifTimerRef.current = setInterval(checkUpcomingBookings, 30000);
    } else {
      if (notifTimerRef.current) clearInterval(notifTimerRef.current);
    }
    return () => { if (notifTimerRef.current) clearInterval(notifTimerRef.current); };
  }, [notifEnabled, checkUpcomingBookings]);

  function toggleNotifications() {
    if (!('Notification' in window)) { alert('Ваш браузер не поддерживает уведомления'); return; }
    if (notifEnabled) { setNotifEnabled(false); return; }
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        setNotifEnabled(true);
        new Notification('break.desk', { body: `Уведомления включены — напомним за ${notifAhead} мин до перерыва или обеда` });
      } else {
        alert('Разрешите уведомления в настройках браузера');
      }
    });
  }

  // ── Log ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!logOpen) return;
    loadLog(logDayOffset);
  }, [logOpen, logDayOffset]);

  async function loadLog(offset: number) {
    setLogLoading(true);
    setLogEntries(null);
    const kyiv = kyivNow();
    const targetDay = new Date(kyiv);
    targetDay.setDate(targetDay.getDate() + offset);
    const targetDate = targetDay.toISOString().slice(0, 10);
    const kyivH = kyiv.getHours();
    let dateFilter = 'shift_date=eq.' + targetDate;
    if (offset === 0 && kyivH < 9) {
      const prevDay = new Date(kyiv);
      prevDay.setDate(prevDay.getDate() - 1);
      dateFilter = 'shift_date=in.(' + prevDay.toISOString().slice(0, 10) + ',' + targetDate + ')';
    }
    try {
      const r = await sbFetch('/rest/v1/logs?' + dateFilter + '&order=id.desc&limit=200');
      const rows = await r.json();
      setLogEntries(Array.isArray(rows) ? rows : []);
    } catch {
      setLogEntries([]);
    } finally {
      setLogLoading(false);
    }
  }

  // ── Transfers ──────────────────────────────────────────────────────────────

  async function doTransfer(fromSection: string, fromDept: string, name: string, toSection: string, toDept: string) {
    const kyivH = kyivNow().getHours();
    const activeShift = (kyivH >= 21 || kyivH < 9) ? 'night' : 'day';
    const expiresAt = getTransferExpiresAt(activeShift);
    await sbFetch('/rest/v1/transfers', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ operator: name, from_section: fromSection, from_dept: fromDept, to_section: toSection, to_dept: toDept, expires_at: expiresAt }),
    });
    await loadTransfersData();
  }

  async function revertTransfer(fromSection: string, fromDept: string, name: string) {
    await sbFetch(
      '/rest/v1/transfers?operator=eq.' + encodeURIComponent(name) +
      '&from_section=eq.' + fromSection + '&from_dept=eq.' + fromDept,
      { method: 'DELETE', prefer: 'return=minimal' }
    );
    await loadTransfersData();
  }

  // ── Roster ─────────────────────────────────────────────────────────────────

  async function addOperatorToList(key: string, name: string) {
    if (!name.trim()) return;
    const next = { ...operators, sg: { ...operators.sg }, nc: { ...operators.nc } };
    if (key === 'sg_regular' && !next.sg.regular.includes(name)) { next.sg.regular = [...next.sg.regular, name].sort(); }
    if (key === 'sg_vip'     && !next.sg.vip.includes(name))     { next.sg.vip     = [...next.sg.vip,     name].sort(); }
    if (key === 'nc_regular' && !next.nc.regular.includes(name)) { next.nc.regular = [...next.nc.regular, name].sort(); }
    setOperators(next);
    setRosterInputs(prev => ({ ...prev, [key]: '' }));
    try { await saveRosterData(next); } catch { /* ignore */ }
  }

  async function removeOperatorFromList(key: string, name: string) {
    if (!confirm('Удалить "' + name + '" из списка? Это нельзя отменить.')) return;
    const next = { ...operators, sg: { ...operators.sg }, nc: { ...operators.nc } };
    if (key === 'sg_regular') next.sg.regular = next.sg.regular.filter(n => n !== name);
    if (key === 'sg_vip')     next.sg.vip     = next.sg.vip.filter(n => n !== name);
    if (key === 'nc_regular') next.nc.regular = next.nc.regular.filter(n => n !== name);
    setOperators(next);
    try { await saveRosterData(next); } catch { /* ignore */ }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const mb = myBreaksCount();
  const ml = myLunchCount();
  const emergencyMode = noValidSlotsLeft();
  const lunchSlots = makeLunchSlots(cfg.lunchHours);
  const hasLunch = cfg.lunchHours !== null;

  const takenB = Object.keys(bookings).filter(k => k.startsWith(section + '|' + dept + '|' + shiftId + '|b|')).length;
  const takenL = Object.keys(bookings).filter(k => k.startsWith(section + '|' + dept + '|' + shiftId + '|l|')).length;
  const totalB = cfg.breakGroups.reduce((s, g) => s + g.slots.length, 0);

  const hiClass  = currentOp ? 'brk-card-hi-' + accentMode : '';
  const valClass = currentOp ? 'brk-card-val brk-card-val-' + accentMode : 'brk-card-val';

  // ── Sync dot color ──
  const syncColors: Record<SyncState, string> = {
    connecting: '#7a7a8c',
    online:     '#6ee7b7',
    saving:     '#fbbf24',
    offline:    '#f87171',
  };
  const syncLabels: Record<SyncState, string> = {
    connecting: 'подключение...',
    online:     'синхронизировано',
    saving:     'сохранение...',
    offline:    'офлайн',
  };

  // ── Log title ──
  const logTitle = logDayOffset === 0 ? 'Лог за сегодня' : logDayOffset === -1 ? 'Лог за вчера' : `Лог: ${Math.abs(logDayOffset)} дн. назад`;

  // ── Action labels for log ──
  const actionLabels: Record<string, { text: string; cls: string }> = {
    book_break:   { text: 'забронировал перерыв', cls: 'brk-log-action-book' },
    cancel_break: { text: 'отменил перерыв',      cls: 'brk-log-action-cancel' },
    book_lunch:   { text: 'забронировал обед',    cls: 'brk-log-action-book' },
    cancel_lunch: { text: 'отменил обед',         cls: 'brk-log-action-cancel' },
  };

  const shiftLabels: Record<string, string> = { '9-21': '09–21', '12-24': '12–00', 'night': 'Ночь' };

  // ── Slot renderers ──

  function renderBreakSlot(time: string) {
    const a = accentMode;
    const baseKey = bKey(shiftId, time);
    const occupants = getSlotOccupants(baseKey);
    const crossWho = occupants.length === 0 ? crossBlockedBy(time) : null;
    const myEntry  = occupants.find(o => o.name === currentOp);
    const isMe     = !!myEntry;
    const tooNear  = currentOp ? tooClose(time) : false;

    let slotCls = 'brk-slot ';
    if      (isMe)                          slotCls += 'brk-slot-mine-' + a;
    else if (occupants.length > 0)          slotCls += 'brk-slot-taken';
    else if (crossWho)                      slotCls += 'brk-slot-cross-blocked';
    else if (tooNear && emergencyMode)      slotCls += 'brk-slot-free brk-slot-emergency';
    else                                    slotCls += 'brk-slot-free';

    const canBook = currentOp && !isMe && mb < MAX_BREAKS && !crossWho && (!tooNear || emergencyMode);

    return (
      <div key={time} className={slotCls}>
        <div className="brk-slot-time">{time}</div>

        {/* Who lines */}
        {occupants.length > 0
          ? occupants.map(o => (
              <div key={o.key} className={'brk-slot-who brk-slot-who-' + a}>{o.name}</div>
            ))
          : crossWho
            ? <div className="brk-slot-who brk-slot-who-cross">{shiftId === '9-21' ? '12–00' : '09–21'}: {crossWho}</div>
            : tooNear && emergencyMode
              ? <div className="brk-slot-who" style={{ color: 'var(--brk-warn)', fontSize: 11 }}>↯ вне очереди</div>
              : <div className="brk-slot-who">свободно</div>
        }

        {/* Buttons */}
        {isMe ? (
          <button className="brk-slot-btn brk-slot-btn-cancel" onClick={() => cancelBreak(time)}>отменить</button>
        ) : isAdmin ? (
          <>
            {occupants.map(o => (
              <button key={o.key} className="brk-slot-btn brk-slot-btn-cancel"
                style={{ marginBottom: 3, fontSize: 10 }}
                onClick={() => adminCancelBreak(o.key)}>✕ {o.name}</button>
            ))}
            <button className={'brk-slot-btn brk-slot-btn-' + a} style={{ fontSize: 10 }}
              onClick={() => adminBook('break', time)}>★ добавить</button>
          </>
        ) : !occupants.length && !crossWho ? (
          <button
            className={'brk-slot-btn brk-slot-btn-' + a + (tooNear && emergencyMode ? ' brk-slot-btn-emergency' : '')}
            disabled={!canBook}
            onClick={() => bookBreak(time, tooNear && emergencyMode)}>занять</button>
        ) : null}
      </div>
    );
  }

  function renderLunchSlot(time: string) {
    const a = accentMode;
    const baseKey = lKey(shiftId, time);
    const occupants = getSlotOccupants(baseKey);
    const myEntry   = occupants.find(o => o.name === currentOp);
    const isMe      = !!myEntry;
    const tooNearL  = currentOp && !isMe && tooClose(time);
    const canBook   = currentOp && !isMe && ml < MAX_LUNCHES && !tooNearL;

    let slotCls = 'brk-slot ';
    if      (isMe)              slotCls += 'brk-slot-mine-' + a;
    else if (occupants.length > 0) slotCls += 'brk-slot-taken';
    else                        slotCls += 'brk-slot-free';

    return (
      <div key={time} className={slotCls}>
        <div className="brk-slot-time">{time}</div>
        {occupants.length > 0
          ? occupants.map(o => <div key={o.key} className={'brk-slot-who brk-slot-who-' + a}>{o.name}</div>)
          : <div className="brk-slot-who">свободно</div>
        }
        {isMe ? (
          <button className="brk-slot-btn brk-slot-btn-cancel" onClick={() => cancelLunch(time)}>отменить</button>
        ) : isAdmin ? (
          <>
            {occupants.map(o => (
              <button key={o.key} className="brk-slot-btn brk-slot-btn-cancel"
                style={{ marginBottom: 3, fontSize: 10 }}
                onClick={() => adminCancelLunch(o.key)}>✕ {o.name}</button>
            ))}
            <button className={'brk-slot-btn brk-slot-btn-' + a} style={{ fontSize: 10 }}
              onClick={() => adminBook('lunch', time)}>★ добавить</button>
          </>
        ) : !occupants.length ? (
          <button
            className={'brk-slot-btn brk-slot-btn-' + a}
            disabled={!canBook}
            onClick={() => bookLunch(time)}>занять</button>
        ) : null}
      </div>
    );
  }

  // ── Transfer tab ──

  function TransferTab() {
    const sgRegular = operators.sg.regular;
    const sgVip     = operators.sg.vip;
    const ncRegular = operators.nc.regular;

    function isTransferred(name: string, fromSec: string, fromDpt: string) {
      return transfers.some(t => t.operator === name && t.from_section === fromSec && t.from_dept === fromDpt);
    }
    function expiryLabel(name: string, fromSec: string, fromDpt: string) {
      const t = transfers.find(t => t.operator === name && t.from_section === fromSec && t.from_dept === fromDpt);
      if (!t) return '';
      return ' до ' + new Date(t.expires_at).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Kiev', hour: '2-digit', minute: '2-digit' });
    }

    function TransferRow({ name, fromSec, fromDpt, toSec, toDpt, toLabel, badgeStyle }: {
      name: string; fromSec: string; fromDpt: string; toSec: string; toDpt: string; toLabel: string; badgeStyle: React.CSSProperties;
    }) {
      const moved = isTransferred(name, fromSec, fromDpt);
      const exp   = moved ? expiryLabel(name, fromSec, fromDpt) : '';
      return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'var(--brk-surface2)', borderRadius:8, fontSize:13, marginBottom:6 }}>
          <span>{name}{moved && <span style={{ fontSize:10, fontFamily:'DM Mono,monospace', padding:'2px 7px', borderRadius:4, marginLeft:6, ...badgeStyle }}>→ {toLabel}{exp}</span>}</span>
          {moved
            ? <button onClick={() => revertTransfer(fromSec, fromDpt, name)} style={{ fontSize:11, fontFamily:'DM Mono,monospace', padding:'4px 10px', borderRadius:6, border:'1px solid var(--brk-border2)', background:'transparent', color:'var(--brk-muted)', cursor:'pointer' }}>↩ вернуть</button>
            : <button onClick={() => doTransfer(fromSec, fromDpt, name, toSec, toDpt)} style={{ fontSize:11, fontFamily:'DM Mono,monospace', padding:'4px 10px', borderRadius:6, border:'1px solid var(--brk-border2)', background:'transparent', color:'var(--brk-muted)', cursor:'pointer' }}>→ {toLabel}</button>
          }
        </div>
      );
    }

    const sec = (t: string) => <div style={{ fontSize:12, fontWeight:500, color:'var(--brk-text)', margin:'16px 0 8px' }}>{t}</div>;

    return (
      <div>
        <div style={{ fontSize:11, color:'var(--brk-muted)', fontFamily:'DM Mono,monospace', marginBottom:16 }}>Сбрасывается: дневные в 00:00 · ночные в 09:00 (по Киеву)</div>
        {sec('SG Regular → VIP')}
        {sgRegular.map(n => <TransferRow key={n} name={n} fromSec="sg" fromDpt="regular" toSec="sg" toDpt="vip" toLabel="VIP" badgeStyle={{ background:'rgba(251,191,36,0.12)', color:'var(--brk-warn)' }} />)}
        {sec('SG VIP → Regular')}
        {sgVip.map(n => <TransferRow key={n} name={n} fromSec="sg" fromDpt="vip" toSec="sg" toDpt="regular" toLabel="Regular" badgeStyle={{ background:'rgba(110,231,183,0.12)', color:'var(--brk-accent-day)' }} />)}
        {sec('SG Regular → NC')}
        {sgRegular.map(n => <TransferRow key={n+'_nc'} name={n} fromSec="sg" fromDpt="regular" toSec="nc" toDpt="regular" toLabel="NC" badgeStyle={{ background:'rgba(248,113,113,0.12)', color:'var(--brk-danger)' }} />)}
        {sec('NC → SG Regular')}
        {ncRegular.map(n => <TransferRow key={n} name={n} fromSec="nc" fromDpt="regular" toSec="sg" toDpt="regular" toLabel="SG" badgeStyle={{ background:'rgba(110,231,183,0.12)', color:'var(--brk-accent-day)' }} />)}
        {sec('SG VIP → NC')}
        {sgVip.map(n => <TransferRow key={n+'_nc'} name={n} fromSec="sg" fromDpt="vip" toSec="nc" toDpt="regular" toLabel="NC" badgeStyle={{ background:'rgba(248,113,113,0.12)', color:'var(--brk-danger)' }} />)}
      </div>
    );
  }

  function RosterTab() {
    const sections: { key: string; list: string[]; label: string }[] = [
      { key: 'sg_regular', list: operators.sg.regular, label: 'SG · Regular' },
      { key: 'sg_vip',     list: operators.sg.vip,     label: 'SG · VIP' },
      { key: 'nc_regular', list: operators.nc.regular,  label: 'NC · Regular' },
    ];

    return (
      <div>
        <div style={{ fontSize:11, color:'var(--brk-danger)', fontFamily:'DM Mono,monospace', marginBottom:16, padding:'8px 12px', background:'var(--brk-danger-dim)', borderRadius:8 }}>
          ⚠ Постоянное изменение списка — сохраняется навсегда
        </div>
        {sections.map(({ key, list, label }) => (
          <div key={key} style={{ marginBottom: 20 }}>
            <div style={{ fontSize:11, fontFamily:'DM Mono,monospace', color:'var(--brk-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>{label}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
              {list.map(name => (
                <span key={name} className="brk-roster-chip">
                  {name}
                  <button onClick={() => removeOperatorFromList(key, name)}>✕</button>
                </span>
              ))}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <input
                value={rosterInputs[key] || ''}
                onChange={e => setRosterInputs(p => ({ ...p, [key]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addOperatorToList(key, rosterInputs[key] || ''); }}
                placeholder="Имя оператора"
                style={{ flex:1, padding:'6px 10px', background:'var(--brk-surface2)', border:'1px solid var(--brk-border2)', borderRadius:8, color:'var(--brk-text)', fontSize:13 }}
              />
              <button
                onClick={() => addOperatorToList(key, rosterInputs[key] || '')}
                style={{ padding:'6px 14px', fontSize:12, fontFamily:'DM Mono,monospace', background:'rgba(110,231,183,0.1)', border:'1px solid var(--brk-accent-day-border)', borderRadius:8, color:'var(--brk-accent-day)', cursor:'pointer' }}>
                + добавить
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Header accent color based on section/dept ──
  const logoDotColor = section === 'nc'
    ? 'var(--brk-danger)'
    : dept === 'vip'
      ? 'var(--brk-warn)'
      : accentMode === 'night'
        ? 'var(--brk-accent-night)'
        : 'var(--brk-accent-day)';

  const logoAccentColor = accentMode === 'night' ? 'var(--brk-accent-night)' : 'var(--brk-accent-day)';

  // ── Shift type / id control ──

  function handleSetShiftType(t: ShiftType) {
    setShiftType(t);
    if (t === 'night') {
      setShiftId('night');
    } else {
      setShiftId('9-21');
    }
  }

  function handleSetSection(s: Section) {
    setSection(s);
    if (s === 'nc') setDept('regular');
    setCurrentOp('');
  }

  function handleSetDept(d: Dept) {
    setDept(d);
    setCurrentOp('');
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div className="brk-root">
      {/* ── Header ── */}
      <div className="brk-header">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div className="brk-logo">
            <span className="brk-logo-dot" style={{ background: logoDotColor }} />
            break<span style={{ color: logoAccentColor }}>.</span>desk
          </div>
          <div className="brk-sync-status">
            <span className="brk-sync-dot" style={{ background: syncColors[syncState] }} />
            <span>{syncLabels[syncState]}</span>
          </div>
        </div>

        <div className="brk-controls">
          {/* Section */}
          <div className="brk-seg">
            <button
              className={'brk-seg-btn' + (section === 'sg' ? ' brk-seg-btn-active-day'  : '')}
              onClick={() => handleSetSection('sg')}>SG</button>
            <button
              className={'brk-seg-btn' + (section === 'nc' ? ' brk-seg-btn-active-nc' : '')}
              onClick={() => handleSetSection('nc')}>NC</button>
          </div>

          {/* Dept (only SG) */}
          {section === 'sg' && (
            <div className="brk-seg">
              <button
                className={'brk-seg-btn' + (dept === 'regular' ? ' brk-seg-btn-active-day' : '')}
                onClick={() => handleSetDept('regular')}>Regular</button>
              <button
                className={'brk-seg-btn' + (dept === 'vip'     ? ' brk-seg-btn-active-vip' : '')}
                onClick={() => handleSetDept('vip')}>★ VIP</button>
            </div>
          )}

          {/* Operator select */}
          <div className="brk-select-wrap">
            <select className="brk-select" value={currentOp} onChange={e => setCurrentOp(e.target.value)}>
              <option value="">— оператор —</option>
              {currentOpList.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="brk-select-arrow">▼</span>
          </div>

          {/* Op badge */}
          {currentOp && <div className="brk-badge">{currentOp}</div>}

          {/* Admin btn */}
          {isAdminUser && (
            <button className="brk-btn brk-admin-btn" onClick={() => setAdminOpen(true)}>★ админ</button>
          )}

          {/* Log btn */}
          <button className="brk-btn" onClick={() => { setLogDayOffset(0); setLogOpen(true); }}>☰ лог</button>

          {/* Notifications */}
          <div className="brk-notif-group">
            <button
              className="brk-notif-timing-btn"
              onClick={toggleNotifications}
              style={{
                borderRadius: '8px 0 0 8px',
                borderRight: 'none',
                color: notifEnabled ? 'var(--brk-accent-day)' : undefined,
                borderColor: notifEnabled ? 'var(--brk-accent-day-border)' : undefined,
              }}>
              {notifEnabled ? '🔔 вкл' : '🔔'}
            </button>
            {[1, 2, 5, 10].map((min, i, arr) => (
              <button
                key={min}
                className="brk-notif-timing-btn"
                onClick={() => setNotifAhead(min)}
                style={{
                  borderRadius: i === arr.length - 1 ? '0 8px 8px 0' : 0,
                  borderRight: i === arr.length - 1 ? undefined : 'none',
                  color: notifAhead === min ? 'var(--brk-accent-day)' : undefined,
                  borderColor: notifAhead === min ? 'var(--brk-accent-day-border)' : undefined,
                  background: notifAhead === min ? 'var(--brk-accent-day-dim)' : undefined,
                }}>
                {min}м
              </button>
            ))}
          </div>

          {/* Shift type */}
          <div className="brk-seg">
            <button
              className={'brk-seg-btn' + (shiftType === 'day'   ? ' brk-seg-btn-active-day'   : '')}
              onClick={() => handleSetShiftType('day')}>☀ День</button>
            <button
              className={'brk-seg-btn' + (shiftType === 'night' ? ' brk-seg-btn-active-night' : '')}
              onClick={() => handleSetShiftType('night')}>☽ Ночь</button>
          </div>

          {/* Day shift picker */}
          {shiftType === 'day' && (
            <div className="brk-seg">
              <button
                className={'brk-seg-btn' + (shiftId === '9-21'  ? ' brk-seg-btn-active-day' : '')}
                onClick={() => setShiftId('9-21')}>09–21</button>
              <button
                className={'brk-seg-btn' + (shiftId === '12-24' ? ' brk-seg-btn-active-day' : '')}
                onClick={() => setShiftId('12-24')}>12–00</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main ── */}
      <div className="brk-main">

        {/* Summary cards */}
        <div className="brk-summary">
          <div className={'brk-card ' + hiClass}>
            <div className="brk-card-label">Мои перерывы</div>
            <div className={valClass}>{mb}<small style={{ fontSize:14, fontWeight:400, color:'var(--brk-muted)' }}>/{MAX_BREAKS}</small></div>
          </div>
          {hasLunch && (
            <div className={'brk-card ' + hiClass}>
              <div className="brk-card-label">Мой обед</div>
              <div className={valClass}>{ml}<small style={{ fontSize:14, fontWeight:400, color:'var(--brk-muted)' }}>/{MAX_LUNCHES}</small></div>
            </div>
          )}
          <div className="brk-card">
            <div className="brk-card-label">Занято перерывов</div>
            <div className="brk-card-val">{takenB}<small style={{ fontSize:14, fontWeight:400, color:'var(--brk-muted)' }}>/{totalB}</small></div>
          </div>
          {hasLunch && (
            <div className="brk-card">
              <div className="brk-card-label">Занято обедов</div>
              <div className="brk-card-val">{takenL}<small style={{ fontSize:14, fontWeight:400, color:'var(--brk-muted)' }}>/{lunchSlots.length}</small></div>
            </div>
          )}
        </div>

        {/* Breaks section */}
        <div className="brk-section-head">
          <div className="brk-section-title">Перерывы</div>
          {(shiftId === '9-21' || shiftId === '12-24') && (
            <span className="brk-section-sub" style={{ opacity:0.4 }}>★ янтарный = занят смежной сменой</span>
          )}
          {currentOp && mb >= MAX_BREAKS && <span className="brk-quota-warn">лимит 4/4</span>}
          {emergencyMode && (
            <span className="brk-quota-warn" style={{ color:'var(--brk-warn)', background:'var(--brk-warn-dim)', borderColor:'rgba(251,191,36,0.25)' }}>
              ↯ все слоты заняты — доступно вне очереди
            </span>
          )}
          <div className="brk-section-line" />
        </div>

        <div className="brk-groups-wrap">
          {cfg.breakGroups.map(({ label, slots }) => (
            <div key={label} className="brk-group">
              <div className="brk-group-label">{label}</div>
              <div className="brk-slot-grid">
                {slots.map(t => renderBreakSlot(t))}
              </div>
            </div>
          ))}
        </div>

        {/* Lunch section */}
        {hasLunch && cfg.lunchHours && (
          <>
            <div className="brk-section-head" style={{ marginTop: 28 }}>
              <div className="brk-section-title">
                Обед <span className="brk-section-sub">{cfg.lunchHours[0]}:00 – {cfg.lunchHours[cfg.lunchHours.length-1]}:00</span>
              </div>
              {currentOp && ml >= MAX_LUNCHES && <span className="brk-quota-warn">обед занят</span>}
              <div className="brk-section-line" />
            </div>
            <div className="brk-slot-grid-wide">
              {lunchSlots.map(t => renderLunchSlot(t))}
            </div>
          </>
        )}
      </div>

      {/* ── Log overlay ── */}
      <div
        className={'brk-log-overlay' + (logOpen ? ' brk-log-overlay-active' : '')}
        onClick={e => { if (e.target === e.currentTarget) setLogOpen(false); }}>
        <div className="brk-log-panel">
          <div className="brk-log-head">
            <span className="brk-log-head-title">{logTitle}</span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button className="brk-log-refresh" onClick={() => setLogDayOffset(d => d - 1)}>◀</button>
              <button className="brk-log-refresh" onClick={() => setLogDayOffset(d => Math.min(0, d + 1))}>▶</button>
              <button className="brk-log-refresh" onClick={() => loadLog(logDayOffset)}>↻</button>
              <button className="brk-log-close" onClick={() => setLogOpen(false)}>✕</button>
            </div>
          </div>
          <div className="brk-log-body">
            {logLoading && <div className="brk-log-empty">загрузка...</div>}
            {!logLoading && logEntries !== null && logEntries.length === 0 && (
              <div className="brk-log-empty">пока нет действий за сегодня</div>
            )}
            {!logLoading && logEntries && logEntries.map(e => {
              const al = actionLabels[e.action] || { text: e.action, cls: '' };
              const sectCls = e.section === 'nc' ? 'brk-log-badge-nc' : (e.dept === 'vip' ? 'brk-log-badge-vip' : 'brk-log-badge-sg');
              const sectLabel = e.section === 'nc' ? 'NC' : (e.dept === 'vip' ? 'VIP' : 'SG');
              return (
                <div key={e.id} className="brk-log-entry">
                  <div className="brk-log-time">{e.time_kyiv}</div>
                  <div>
                    <div className="brk-log-op">
                      {e.operator}
                      <span className={'brk-log-badge ' + sectCls}>{sectLabel}</span>
                      {e.user_email && <span style={{ fontSize:10, color:'var(--brk-muted)', fontWeight:400, marginLeft:6 }}>({e.user_email})</span>}
                    </div>
                    <div className="brk-log-detail">
                      <span className={al.cls}>{al.text}</span> · {e.slot} · {shiftLabels[e.shift] || e.shift}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Admin overlay ── */}
      <div
        className={'brk-admin-overlay' + (adminOpen ? ' brk-admin-overlay-active' : '')}
        onClick={e => { if (e.target === e.currentTarget) setAdminOpen(false); }}>
        <div className="brk-admin-panel">
          <div className="brk-admin-head">
            <span style={{ fontSize:14, fontWeight:500, color:'var(--brk-warn)', fontFamily:'DM Mono,monospace' }}>★ Админ-панель</span>
            <button className="brk-log-close" onClick={() => setAdminOpen(false)}>✕</button>
          </div>
          <div className="brk-admin-tabs">
            <button
              className={'brk-admin-tab' + (adminTab === 'transfer' ? ' brk-admin-tab-active' : '')}
              onClick={() => setAdminTab('transfer')}>↔ Трансфер</button>
            <button
              className={'brk-admin-tab' + (adminTab === 'roster'   ? ' brk-admin-tab-active' : '')}
              onClick={() => setAdminTab('roster')}>✎ Состав</button>
          </div>
          <div className="brk-admin-body">
            {adminTab === 'transfer' ? <TransferTab /> : <RosterTab />}
          </div>
        </div>
      </div>

      {/* ── Op Pick modal ── */}
      <div
        className={'brk-op-pick-overlay' + (opPickOpen ? ' brk-op-pick-overlay-active' : '')}
        onClick={e => { if (e.target === e.currentTarget) setOpPickOpen(false); }}>
        <div className="brk-op-pick-box">
          <div style={{ fontSize:13, fontFamily:'DM Mono,monospace', color:'var(--brk-text)', marginBottom:12 }}>Выберите оператора</div>
          <select
            value={opPickSel}
            onChange={e => setOpPickSel(e.target.value)}
            style={{ width:'100%', padding:'8px 10px', background:'var(--brk-surface2)', border:'1px solid var(--brk-border2)', borderRadius:8, color:'var(--brk-text)', fontSize:14, marginBottom:12, fontFamily:'DM Sans,sans-serif' }}>
            {currentOpList.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button
              onClick={() => { setOpPickOpen(false); setOpPickCb(null); }}
              style={{ padding:'7px 16px', fontSize:13, fontFamily:'DM Mono,monospace', borderRadius:8, border:'1px solid var(--brk-border2)', background:'transparent', color:'var(--brk-muted)', cursor:'pointer' }}>
              Отмена
            </button>
            <button
              onClick={() => {
                if (opPickCb && opPickSel) opPickCb(opPickSel);
                setOpPickOpen(false);
                setOpPickCb(null);
              }}
              style={{ padding:'7px 16px', fontSize:13, fontFamily:'DM Mono,monospace', borderRadius:8, border:'1px solid rgba(251,191,36,0.35)', background:'rgba(251,191,36,0.12)', color:'var(--brk-warn)', cursor:'pointer' }}>
              Забронировать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
