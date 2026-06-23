import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useScheduleState } from '@/lib/useScheduleState';
import type { ProjectKey } from '@/lib/projects';
import { calcDayHours, dateStr, swapAnnotation, getShift, localDs } from '@/lib/scheduleLogic';
import type { Override } from '@/lib/scheduleLogic';
import type { ScheduleSettings } from '@/lib/scheduleApi';
import { exportToExcel } from './exportExcel';
import './schedule.css';

// ── Lazy components ─────────────────────────────────────────────────────────────
const Toast = React.lazy(() => import('./components/Toast'));
const StatsBar = React.lazy(() => import('./components/StatsBar'));
const DayInfoPanel = React.lazy(() => import('./components/DayInfoPanel'));
const ShiftEditorModal = React.lazy(() => import('./components/ShiftEditorModal'));
const SwapModal = React.lazy(() => import('./components/SwapModal'));
const PatternModal = React.lazy(() => import('./components/PatternModal'));
const AddEmployeeModal = React.lazy(() => import('./components/AddEmployeeModal'));
const DismissModal = React.lazy(() => import('./components/DismissModal'));
const LogPanel = React.lazy(() => import('./components/LogPanel'));
const ScheduleSection = React.lazy(() => import('./components/ScheduleSection'));
const ProfileModal = React.lazy(() => import('./components/ProfileModal'));

// ── Типы ─────────────────────────────────────────────────────────────────────────

interface CurrentUser { email: string; role: string }

// ── Page ──────────────────────────────────────────────────────────────────────────

export default function SchedulePage({ project = 'sg' }: { project?: ProjectKey } = {}) {
  // Auth
  const { data: authData } = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const res = await fetch('/api/check', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json() as Promise<{ ok: boolean; email: string; role: string }>;
    },
  });
  const currentUser: CurrentUser | null = authData?.ok ? { email: authData.email, role: authData.role } : null;

  const st = useScheduleState(currentUser, project);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err'; show: boolean }>({ msg: '', type: 'ok', show: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((msg: string, type: 'ok' | 'err') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type, show: true });
    toastTimer.current = setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  }, []);

  // Stale warning
  const [staleWarning, setStaleWarning] = useState(false);

  // UI state
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved !== 'light';
  });
  const [infoColumnVisible, setInfoColumnVisible] = useState(false);
  const [positionsMode, setPositionsMode] = useState(false);
  const [logVisible, setLogVisible] = useState(false);

  // Modals
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorOperator, setEditorOperator] = useState<string | undefined>();
  const [editorDate, setEditorDate] = useState<string | undefined>();
  const [swapOpen, setSwapOpen] = useState(false);
  const [patternOpen, setPatternOpen] = useState(false);
  const [patternName, setPatternName] = useState<string | null>(null);
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyMetrics, setStickyMetrics] = useState<{ labelW: number; dayW: number[]; left: number; navH: number }>({ labelW: 160, dayW: [], left: 0, navH: 65 });
  const stickyInnerRef = useRef<HTMLDivElement>(null);

  // Theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Sticky dates bar — следит за активной (ближайшей к navH снизу) секцией
  useEffect(() => {
    let activeWrap: HTMLElement | null = null;

    const measureWrap = (wrap: HTMLElement) => {
      const table = wrap.querySelector('table.schedule-table');
      if (!table) return;
      const headRows = table.querySelectorAll('thead tr');
      const dateRow = headRows[headRows.length - 1];
      if (!dateRow) return;
      const ths = Array.from(dateRow.querySelectorAll('th')) as HTMLElement[];
      let labelW = 0;
      const dayW: number[] = [];
      for (const th of ths) {
        if (th.classList.contains('day-th')) dayW.push(th.getBoundingClientRect().width);
        else if (!th.classList.contains('col-total')) labelW += th.getBoundingClientRect().width;
      }
      const left = wrap.getBoundingClientRect().left;
      const navH = (document.querySelector('.nav') as HTMLElement | null)?.offsetHeight ?? 65;
      if (labelW > 0 && dayW.length > 0) {
        setStickyMetrics(prev => {
          if (prev.labelW === labelW && Math.abs(prev.left - left) < 0.5 && prev.navH === navH && prev.dayW.length === dayW.length &&
              prev.dayW.every((w, i) => Math.abs(w - dayW[i]) < 0.5)) return prev;
          return { labelW, dayW, left, navH };
        });
      }
    };

    const onTableScroll = () => {
      if (activeWrap && stickyInnerRef.current) stickyInnerRef.current.scrollLeft = activeWrap.scrollLeft;
    };

    const bindScroll = (wrap: HTMLElement) => {
      if (wrap === activeWrap) return;
      activeWrap?.removeEventListener('scroll', onTableScroll);
      activeWrap = wrap;
      wrap.addEventListener('scroll', onTableScroll, { passive: true });
    };

    const update = () => {
      const navEl = document.querySelector('.nav') as HTMLElement | null;
      const navH = navEl ? navEl.offsetHeight : 65;
      const wraps = Array.from(document.querySelectorAll('.table-wrap')) as HTMLElement[];
      if (!wraps.length) { setStickyVisible(false); return; }

      // Найдём первую секцию, чей tbody ещё виден (top секции ниже navH или tbody не ушёл вниз)
      let best: HTMLElement | null = null;
      for (const wrap of wraps) {
        const r = wrap.getBoundingClientRect();
        if (r.bottom > navH + 40 && r.top < window.innerHeight) {
          best = wrap;
          break;
        }
      }
      if (!best) { setStickyVisible(false); return; }

      // Показываем бар только если шапка этой таблицы ушла за navH
      const thead = best.querySelector('thead');
      const theadBottom = thead ? thead.getBoundingClientRect().bottom : best.getBoundingClientRect().top;
      setStickyVisible(theadBottom < navH + 4);

      bindScroll(best);
      measureWrap(best);
      if (stickyInnerRef.current) stickyInnerRef.current.scrollLeft = best.scrollLeft;
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const iv = setInterval(update, 600);
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      activeWrap?.removeEventListener('scroll', onTableScroll);
      clearInterval(iv);
    };
  }, [stickyInnerRef]);

  // Handlers
  const handleQuickEdit = useCallback((name: string, ds: string, di: number) => {
    if (!st.isAdmin) return;
    setEditorOperator(name);
    setEditorDate(ds);
    setEditorOpen(true);
  }, [st.isAdmin]);

  const handleSaveOverrides = useCallback(async (
    newOverrides: Record<string, Override>,
    logEntries: Array<{ action: string; target?: string }>
  ) => {
    try {
      await st.saveOverrides(newOverrides, undefined, logEntries);
      showToast('Изменения сохранены', 'ok');
      setEditorOpen(false);
    } catch (err: unknown) {
      if ((err as { stale?: boolean }).stale) {
        setStaleWarning(true);
      } else {
        showToast((err as Error).message || 'Ошибка сохранения', 'err');
      }
    }
  }, [st, showToast]);

  const handleSaveSettings = useCallback(async (
    newSettings: ScheduleSettings,
    logEntries: Array<{ action: string; target?: string }>
  ) => {
    try {
      await st.saveOverrides(st.overrides, newSettings, logEntries);
      showToast('Сохранено', 'ok');
    } catch (err: unknown) {
      if ((err as { stale?: boolean }).stale) {
        setStaleWarning(true);
      } else {
        showToast((err as Error).message || 'Ошибка', 'err');
      }
    }
  }, [st, showToast]);

  const handleSaveAll = useCallback(async (
    newOverrides: Record<string, Override>,
    newSettings: ScheduleSettings,
    logEntries: Array<{ action: string; target?: string }>
  ) => {
    try {
      await st.saveOverrides(newOverrides, newSettings, logEntries);
      showToast('Сохранено', 'ok');
    } catch (err: unknown) {
      if ((err as { stale?: boolean }).stale) {
        setStaleWarning(true);
      } else {
        showToast((err as Error).message || 'Ошибка', 'err');
      }
    }
  }, [st, showToast]);

  const handleRestoreDismissed = useCallback(async (name: string) => {
    const newOverrides = { ...st.overrides };
    Object.keys(newOverrides).forEach(key => {
      if (key.startsWith(`${name}:`) && newOverrides[key].type === 'dismissed') {
        delete newOverrides[key];
      }
    });
    const newDismissed = { ...st.dismissedEmployees };
    delete newDismissed[name];
    const newSettings = { ...st.settings, dismissed: newDismissed };
    try {
      await st.saveOverrides(newOverrides, newSettings, [{ action: 'восстановлен', target: name }]);
      showToast(`${name} восстановлен`, 'ok');
      setEditorOpen(false);
    } catch {
      showToast('Ошибка', 'err');
    }
  }, [st, showToast]);

  const handleRemoveMember = useCallback((name: string, sectionKey: string) => {
    const customOrder: Record<string, string[]> = {};
    st.sections.forEach(s => {
      customOrder[s.key] = [...(st.settings.customOrder?.[s.key] ?? s.members)];
    });
    customOrder[sectionKey] = customOrder[sectionKey].filter(n => n !== name);
    handleSaveSettings({ ...st.settings, customOrder }, [{ action: `убран из секции: ${name}`, target: name }]);
  }, [st.sections, st.settings, handleSaveSettings]);

  const handleMoveOperator = useCallback((
    srcName: string, fromKey: string, toKey: string,
    beforeName: string | null, insertAfter: boolean
  ) => {
    const customOrder: Record<string, string[]> = {};
    st.sections.forEach(s => {
      customOrder[s.key] = [...(st.settings.customOrder?.[s.key] ?? s.members)];
    });

    if (fromKey !== toKey) {
      customOrder[fromKey] = customOrder[fromKey].filter(n => n !== srcName);
    }

    const members = customOrder[toKey].filter(n => n !== srcName);
    let insertIdx = members.length;
    if (beforeName) {
      const idx = members.indexOf(beforeName);
      if (idx >= 0) insertIdx = insertAfter ? idx + 1 : idx;
    }
    members.splice(insertIdx, 0, srcName);
    customOrder[toKey] = members;

    handleSaveSettings({ ...st.settings, customOrder }, [{ action: `перемещён: ${srcName} → ${toKey}`, target: srcName }]);
  }, [st.sections, st.settings, handleSaveSettings]);

  const handleExport = useCallback(() => {
    exportToExcel({
      year: st.year,
      month: st.month,
      days: st.days,
      sections: st.sections,
      overrides: st.overrides,
      getShiftForCell: st.getShiftForCell,
      getEmp: st.getEmp,
      employeeHoursSeed: st.employeeHoursSeed,
    }).catch(() => showToast('Ошибка экспорта', 'err'));
  }, [st, showToast]);

  const allExistingNames = st.sections.flatMap(s => s.members);

  const prevMonth = () => {
    const idx = st.availableMonths.findIndex(m => m.year === st.year && m.month === st.month);
    if (idx > 0) {
      const prev = st.availableMonths[idx - 1];
      st.switchMonth(prev.year, prev.month);
    }
  };
  const nextMonth = () => {
    const idx = st.availableMonths.findIndex(m => m.year === st.year && m.month === st.month);
    if (idx < st.availableMonths.length - 1) {
      const next = st.availableMonths[idx + 1];
      st.switchMonth(next.year, next.month);
    }
  };
  const curIdx = st.availableMonths.findIndex(m => m.year === st.year && m.month === st.month);
  const monthLabel = st.availableMonths[curIdx]?.label ?? `${st.month}/${st.year}`;

  if (st.isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
        Загрузка графика...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', maxWidth: '100%', boxSizing: 'border-box' }}>

      {/* Sticky dates bar */}
      {stickyVisible && (
        <div className="sticky-dates-bar" style={{ display: 'flex', top: stickyMetrics.navH, left: stickyMetrics.left }}>
          <div className="sticky-dates-label" style={{ width: stickyMetrics.labelW, minWidth: stickyMetrics.labelW }}>Дата</div>
          <div className="sticky-dates-inner" ref={stickyInnerRef} style={{ overflowX: 'hidden' }}>
            {st.days.map((day, di) => {
              const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
              const now = new Date();
              const isToday = day.d === now.getDate() && st.month === now.getMonth() + 1 && st.year === now.getFullYear();
              const ds = `${st.year}-${String(st.month).padStart(2,'0')}-${String(day.d).padStart(2,'0')}`;
              const w = stickyMetrics.dayW[di] ?? 36;
              return (
                <div
                  key={day.d}
                  className={`sticky-date-cell${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}${ds === st.selectedDateStr ? ' selected' : ''}`}
                  style={{ width: w, minWidth: w }}
                  onClick={() => st.setSelectedDateStr(ds)}
                >
                  {day.d}
                  <span className="sdc-day">{['вс','пн','вт','ср','чт','пт','сб'][day.date.getDay()]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stale warning */}
      {staleWarning && (
        <div className="stale-overlay">
          <div className="stale-box">
            <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--text)' }}>Данные устарели</div>
            <div style={{ color: 'var(--text-sub)', fontSize: 14, marginBottom: 20 }}>
              Кто-то внёс изменения пока страница была открыта. Перезагрузите страницу.
            </div>
            <button className="btn btn-primary" onClick={() => location.reload()}>Перезагрузить</button>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="nav">
        <div className="nav-left">
          <a href="/support" className="back-btn">← Support</a>
          <div className="nav-title">Support<span>CIS</span> — {st.projectLabel}</div>
        </div>
        <div className="nav-right">
          <div className="month-nav">
            <button className="nav-btn" onClick={prevMonth} disabled={curIdx <= 0}>‹</button>
            <span className="month-badge">{monthLabel}</span>
            <button className="nav-btn" onClick={nextMonth} disabled={curIdx >= st.availableMonths.length - 1}>›</button>
          </div>

          <button className="theme-toggle" onClick={() => setIsDark(d => !d)}>
            <span className="theme-toggle-icon">{isDark ? '🌙' : '☀️'}</span>
            <span className="theme-toggle-label">{isDark ? 'Тёмная' : 'Светлая'}</span>
          </button>

          <button className="filter-btn" onClick={() => setInfoColumnVisible(v => !v)}>
            ⇔ Инфо{!infoColumnVisible ? ' ▸' : ''}
          </button>

          <button className="filter-btn" style={{ color: 'var(--support)', borderColor: 'rgba(52,211,153,0.3)' }} onClick={handleExport}>↓ Excel</button>

          {(st.isAdmin || (() => {
            const all = st.sections.flatMap(s => s.members);
            return all.find(n => st.getEmp(n).email.toLowerCase() === currentUser?.email?.toLowerCase());
          })()) && (
            <button className="admin-btn visible" style={{ background: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.3)', color: '#34d399' }} onClick={() => setSwapOpen(true)}>
              🔄 Отдать смену
            </button>
          )}

          {st.isAdmin && (
            <button className={`admin-btn visible${positionsMode ? ' positions-active' : ''}`} style={{ background: 'rgba(245,158,66,0.1)', borderColor: 'rgba(245,158,66,0.3)', color: 'var(--ops, #f59e42)' }} onClick={() => setPositionsMode(p => !p)}>
              ⇅ Позиции{positionsMode ? ' вкл' : ''}
            </button>
          )}

          {st.isAdmin && (
            <button className="admin-btn visible" onClick={() => setAddEmpOpen(true)}>+ Сотрудник</button>
          )}

          {st.isAdmin && (
            <button className="admin-btn visible" style={{ background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }} onClick={() => setDismissOpen(true)}>
              🚫 Увольнение
            </button>
          )}

          <button className="filter-btn" onClick={() => setLogVisible(v => !v)}>🕐 История</button>
        </div>
      </nav>

      <div className="main">
      {/* Stats */}
      <React.Suspense fallback={null}>
        <StatsBar
          sections={st.sections}
          statCards={st.statCards}
          onlineOperatorsOnly={st.onlineOperatorsOnly}
          getShiftForCell={st.getShiftForCell}
          days={st.days}
          year={st.year}
          month={st.month}
          overrides={st.overrides}
          employeeHoursSeed={st.employeeHoursSeed}
          getEmp={st.getEmp}
        />
      </React.Suspense>

      {/* Positions banner */}
      {positionsMode && (
        <div className="positions-banner visible">
          <span style={{ flex: 1 }}>⇅ Режим позиций — перетаскивайте строки для изменения порядка.</span>
          <button className="btn btn-secondary" style={{ padding: '3px 12px', fontSize: 11 }} onClick={() => setPositionsMode(false)}>
            Выйти
          </button>
        </div>
      )}

      {/* Day info panel (всплывает сверху при клике на дату) */}
      <React.Suspense fallback={null}>
        <DayInfoPanel
          dateStr={st.selectedDateStr}
          dayIndex={st.selectedDateStr ? (parseInt(st.selectedDateStr.slice(-2), 10) - 1) : 0}
          days={st.days}
          sections={st.sections}
          getShiftForCell={st.getShiftForCell}
          overrides={st.overrides}
          employeeHoursSeed={st.employeeHoursSeed}
          getEmp={st.getEmp}
          onClose={() => st.setSelectedDateStr(null)}
          project={st.project}
        />
      </React.Suspense>

      {/* Legend */}
      <div className="legend">
        <span className="legend-label">Легенда:</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(96,165,250,0.85)' }} />09–21 (11ч)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(67,56,202,0.85)' }} />21–09 (11ч)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} />12–00 (11ч)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(45,212,191,0.85)' }} />VIP 09–21 (11ч)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(232,121,249,0.85)' }} />VIP 21–09 (11ч)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(250,204,21,0.85)' }} />Sup День (11ч)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(153,27,27,0.9)' }} />Sup Ночь (11ч)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#8b5cf6' }} />8ч (TL/QA)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#94a3b8' }} />НК (11ч)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#f87171' }} />✈ Отпуск</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#fbbf24' }} />🤒 Больничный</span>
        <span className="legend-item"><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>—</span> Выходной</span>
      </div>

      {/* Filters */}
      <div className="filters">
        {st.filters.map(f => (
          <button
            key={f.key}
            className={`filter-btn${st.activeFilter === f.key ? ' active' : ''}`}
            onClick={() => st.setActiveFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Schedule sections */}
      <React.Suspense fallback={<div style={{ color: 'var(--text-sub)', padding: 16 }}>Загрузка таблицы...</div>}>
        {st.filteredSections.map(section => (
          <ScheduleSection
            key={section.key}
            section={section}
            allSections={st.sections}
            collapsed={st.collapsedSections.has(section.key)}
            onToggle={() => st.toggleSection(section.key)}
            days={st.days}
            year={st.year}
            month={st.month}
            overrides={st.overrides}
            selectedDateStr={st.selectedDateStr}
            onSelectDate={(ds, di) => st.setSelectedDateStr(ds)}
            getShiftForCell={st.getShiftForCell}
            getEmp={st.getEmp}
            employeeHoursSeed={st.employeeHoursSeed}
            dismissedEmployees={st.dismissedEmployees}
            isAdmin={st.isAdmin}
            positionsMode={positionsMode}
            infoColumnVisible={infoColumnVisible}
            onQuickEdit={handleQuickEdit}
            onOpenPattern={(name) => { setPatternName(name); setPatternOpen(true); }}
            onMoveOperator={handleMoveOperator}
            onRemoveMember={positionsMode ? handleRemoveMember : undefined}
          />
        ))}
      </React.Suspense>

      </div>{/* /.main */}

      {/* Log drawer (right side) */}
      {logVisible && (
        <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) setLogVisible(false); }}>
          <div className="modal-panel" style={{ width: 420, maxWidth: '95vw', maxHeight: 'calc(100vh - 32px)' }}>
            <div className="modal-title">
              🕐 История изменений
              <button className="modal-close" onClick={() => setLogVisible(false)}>✕</button>
            </div>
            <React.Suspense fallback={null}>
              <LogPanel log={st.log} />
            </React.Suspense>
          </div>
        </div>
      )}

      {/* Shift editor */}
      {st.isAdmin && (
        <React.Suspense fallback={null}>
          <ShiftEditorModal
            open={editorOpen}
            onClose={() => setEditorOpen(false)}
            initialOperator={editorOperator}
            initialDate={editorDate}
            sections={st.sections}
            year={st.year}
            month={st.month}
            days={st.days}
            overrides={st.overrides}
            dismissedEmployees={st.dismissedEmployees}
            getShiftForCell={st.getShiftForCell}
            getEmp={st.getEmp}
            currentUser={currentUser}
            isAdmin={st.isAdmin}
            onSave={handleSaveOverrides}
            onOpenProfile={(name) => { setEditorOpen(false); setProfileName(name); setProfileOpen(true); }}
            onOpenPattern={(name) => { setEditorOpen(false); setPatternName(name); setPatternOpen(true); }}
            onOpenDismiss={() => { setEditorOpen(false); setDismissOpen(true); }}
            onRestoreDismissed={handleRestoreDismissed}
          />
        </React.Suspense>
      )}

      {/* Swap modal */}
      <React.Suspense fallback={null}>
        <SwapModal
          open={swapOpen}
          onClose={() => setSwapOpen(false)}
          year={st.year}
          month={st.month}
          days={st.days}
          sections={st.sections}
          overrides={st.overrides}
          dismissedEmployees={st.dismissedEmployees}
          operatorPatterns={st.operatorPatterns}
          operatorBaseShifts={st.operatorBaseShifts}
          getEmp={st.getEmp}
          getShiftForCell={st.getShiftForCell}
          currentUser={currentUser}
          isAdmin={st.isAdmin}
          employeeHoursSeed={st.employeeHoursSeed}
          project={st.project}
          swapSectionKeys={st.swapSectionKeys}
          onSuccess={(msg) => { showToast(msg, 'ok'); setSwapOpen(false); }}
          onError={(msg) => showToast(msg, 'err')}
        />
      </React.Suspense>

      {/* Pattern modal */}
      <React.Suspense fallback={null}>
        <PatternModal
          open={patternOpen}
          name={patternName}
          onClose={() => setPatternOpen(false)}
          settings={st.settings}
          overrides={st.overrides}
          year={st.year}
          month={st.month}
          version={st.version}
          onSave={async (newSettings, logEntries) => {
            await handleSaveSettings(newSettings, logEntries);
            setPatternOpen(false);
          }}
        />
      </React.Suspense>

      {/* Add employee */}
      {st.isAdmin && (
        <React.Suspense fallback={null}>
          <AddEmployeeModal
            open={addEmpOpen}
            onClose={() => setAddEmpOpen(false)}
            sections={st.sections}
            existingNames={allExistingNames}
            settings={st.settings}
            overrides={st.overrides}
            year={st.year}
            month={st.month}
            version={st.version}
            onSave={async (newSettings, logEntries) => {
              await handleSaveSettings(newSettings, logEntries);
              setAddEmpOpen(false);
            }}
          />
        </React.Suspense>
      )}

      {/* Dismiss modal */}
      {st.isAdmin && (
        <React.Suspense fallback={null}>
          <DismissModal
            open={dismissOpen}
            onClose={() => setDismissOpen(false)}
            sections={st.sections}
            dismissedEmployees={st.dismissedEmployees}
            overrides={st.overrides}
            settings={st.settings}
            year={st.year}
            month={st.month}
            version={st.version}
            onSave={async (newOverrides, newSettings, logEntries) => {
              await handleSaveAll(newOverrides, newSettings, logEntries);
              setDismissOpen(false);
            }}
          />
        </React.Suspense>
      )}

      {/* Profile modal */}
      {st.isAdmin && (
        <React.Suspense fallback={null}>
          <ProfileModal
            open={profileOpen}
            name={profileName}
            onClose={() => setProfileOpen(false)}
            getEmp={st.getEmp}
            settings={st.settings}
            onSave={async (newSettings, logEntries) => {
              await handleSaveSettings(newSettings, logEntries);
              setProfileOpen(false);
            }}
          />
        </React.Suspense>
      )}

      {/* Toast */}
      <React.Suspense fallback={null}>
        <Toast message={toast.msg} type={toast.type} show={toast.show} />
      </React.Suspense>
    </div>
  );
}
