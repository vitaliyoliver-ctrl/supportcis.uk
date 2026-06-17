import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useScheduleState } from '@/lib/useScheduleState';
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

// ── Типы ─────────────────────────────────────────────────────────────────────────

interface CurrentUser { email: string; role: string }

// ── Page ──────────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
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

  const st = useScheduleState(currentUser);

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
  const [infoColumnVisible, setInfoColumnVisible] = useState(true);
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

  // Theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

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

  const handleMoveOperator = useCallback((
    srcName: string, fromKey: string, toKey: string,
    beforeName: string | null, insertAfter: boolean
  ) => {
    const people = { ...(st.settings.people ?? {}) };
    const toSec = st.sections.find(s => s.key === toKey);
    if (!toSec) return;

    const members = [...toSec.members].filter(n => n !== srcName);
    let insertIdx = members.length;
    if (beforeName) {
      const idx = members.indexOf(beforeName);
      if (idx >= 0) insertIdx = insertAfter ? idx + 1 : idx;
    }
    members.splice(insertIdx, 0, srcName);

    members.forEach((name, i) => {
      people[name] = { section: toKey, order: i };
    });

    handleSaveSettings({ ...st.settings, people }, [{ action: `перемещён: ${srcName} → ${toKey}`, target: srcName }]);
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0 12px 32px', maxWidth: '100%', boxSizing: 'border-box' }}>

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
      <div className="schedule-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            Support<span style={{ color: 'var(--accent)' }}>CIS</span>
          </span>
        </div>

        <div className="month-nav">
          <button className="nav-btn" onClick={prevMonth} disabled={curIdx <= 0}>‹</button>
          <span className="month-label">{monthLabel}</span>
          <button className="nav-btn" onClick={nextMonth} disabled={curIdx >= st.availableMonths.length - 1}>›</button>
        </div>

        <div className="filter-tabs">
          {(['all','regular','vip','supervisors','management'] as const).map(f => (
            <button
              key={f}
              className={`filter-btn${st.activeFilter === f ? ' active' : ''}`}
              onClick={() => st.setActiveFilter(f)}
            >
              {{ all: 'Все', regular: 'Regular', vip: 'VIP', supervisors: 'Sup', management: 'Mgmt' }[f]}
            </button>
          ))}
        </div>

        <div className="toolbar-gap" />

        {st.isAdmin && (
          <button
            className={`toolbar-btn${positionsMode ? ' positions-active' : ''}`}
            onClick={() => setPositionsMode(p => !p)}
          >
            ⇅ Позиции{positionsMode ? ' вкл' : ''}
          </button>
        )}

        {(st.isAdmin || (() => {
          const all = st.sections.flatMap(s => s.members);
          const myName = all.find(n => st.getEmp(n).email.toLowerCase() === currentUser?.email?.toLowerCase());
          return myName;
        })()) && (
          <button className="toolbar-btn swap-btn" onClick={() => setSwapOpen(true)}>
            🔄 Обмен
          </button>
        )}

        <button className="toolbar-btn" onClick={handleExport}>⬇ Excel</button>

        <button
          className="toolbar-btn"
          onClick={() => setInfoColumnVisible(v => !v)}
        >
          ⇔ Инфо{!infoColumnVisible ? ' ▸' : ''}
        </button>

        {st.isAdmin && (
          <button className="toolbar-btn" onClick={() => setAddEmpOpen(true)}>+ Сотрудник</button>
        )}

        {st.isAdmin && (
          <button className="toolbar-btn" style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
            onClick={() => setDismissOpen(true)}>
            ⚑ Уволить
          </button>
        )}

        <button className="toolbar-btn" onClick={() => setLogVisible(v => !v)}>
          📋 Лог
        </button>

        <button className="toolbar-btn" onClick={() => setIsDark(d => !d)}>
          {isDark ? '🌙 Тёмная' : '☀️ Светлая'}
        </button>
      </div>

      {/* Positions banner */}
      {positionsMode && (
        <div className="positions-banner visible">
          ⇅ Режим позиций: перетаскивайте строки для изменения порядка. Нажмите «Позиции» ещё раз чтобы выйти.
        </div>
      )}

      {/* Stats */}
      <React.Suspense fallback={null}>
        <StatsBar
          sections={st.sections}
          getShiftForCell={st.getShiftForCell}
          days={st.days}
          year={st.year}
          month={st.month}
          overrides={st.overrides}
          employeeHoursSeed={st.employeeHoursSeed}
          getEmp={st.getEmp}
        />
      </React.Suspense>

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
          />
        ))}
      </React.Suspense>

      {/* Log */}
      {logVisible && (
        <React.Suspense fallback={null}>
          <LogPanel log={st.log} />
        </React.Suspense>
      )}

      {/* Day info panel */}
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
        />
      </React.Suspense>

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
            onOpenProfile={() => {}}
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

      {/* Toast */}
      <React.Suspense fallback={null}>
        <Toast message={toast.msg} type={toast.type} show={toast.show} />
      </React.Suspense>
    </div>
  );
}
