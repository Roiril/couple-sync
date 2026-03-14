import { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, LayoutList, ClipboardPen } from 'lucide-react';
import styles from './App.module.css';
import { getDailySchedules, saveDailySchedule, type DailySchedule, getDateInfos, saveDateInfo, type DateInfo, syncFromSupabase, subscribeToSupabase } from './db';

function App() {
  // ... (state definitions)
  const [viewMode, setViewMode] = useState<'monthly' | 'weekly' | 'daily'>('monthly');
  const [displayMonth, setDisplayMonth] = useState(new Date(2026, 2, 1)); // March 2026

  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [slideDirection, setSlideDirection] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<DailySchedule[]>([]);
  const [dateInfos, setDateInfos] = useState<DateInfo[]>([]);

  useEffect(() => {
    // Initial sync
    syncFromSupabase().then(() => {
      loadAllDateInfos();
    });

    // Subscribe to changes
    const unsubscribe = subscribeToSupabase(() => {
      loadAllDateInfos();
      if (selectedDate) {
        loadSchedules(selectedDate);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadAllDateInfos = async () => {
    const infos = await getDateInfos();
    setDateInfos(infos);
  };

  useEffect(() => {
    if (selectedDate) {
      // Only load if not already in state to avoid redundant fetches/flashes
      if (!schedules.some(s => s.date === selectedDate)) {
        loadSchedules(selectedDate);
      }
    }
  }, [selectedDate]);

  const loadSchedules = async (dateStr: string) => {
    const data = await getDailySchedules(dateStr);
    setSchedules(prev => {
      // Merge new data with existing, avoiding duplicates for this date
      const filtered = prev.filter(p => p.date !== dateStr);
      return [...filtered, ...data];
    });
  };

  const handleScheduleChange = async (userId: string, content: string, dateAtTimeOfRender: string) => {
    // Use the date passed in to ensure we save for the correct date even if state shifted

    // Optimistic update
    setSchedules(prev => {
      const existingIndex = prev.findIndex(s => s.userId === userId && s.date === dateAtTimeOfRender);
      const newSchedule: DailySchedule = {
        id: existingIndex >= 0 ? prev[existingIndex].id : `${dateAtTimeOfRender}_${userId}`,
        date: dateAtTimeOfRender,
        userId,
        content,
        createdAt: existingIndex >= 0 ? prev[existingIndex].createdAt : Date.now(),
        updatedAt: Date.now()
      };

      const newState = [...prev];
      if (existingIndex >= 0) {
        newState[existingIndex] = newSchedule;
      } else {
        newState.push(newSchedule);
      }

      // Trigger async save
      void saveDailySchedule(newSchedule);

      return newState;
    });
  };

  const handleDateInfoChange = async (dateAtTimeOfRender: string, isDate: boolean, timeText?: string) => {
    const existingIndex = dateInfos.findIndex(d => d.date === dateAtTimeOfRender);
    const newInfo: DateInfo = {
      id: dateAtTimeOfRender,
      date: dateAtTimeOfRender,
      isDate,
      timeText: timeText !== undefined ? timeText : (existingIndex >= 0 ? dateInfos[existingIndex].timeText : ''),
      createdAt: existingIndex >= 0 ? dateInfos[existingIndex].createdAt : Date.now(),
      updatedAt: Date.now()
    };

    const newInfos = [...dateInfos];
    if (existingIndex >= 0) {
      newInfos[existingIndex] = newInfo;
    } else {
      newInfos.push(newInfo);
    }
    setDateInfos(newInfos);
    void saveDateInfo(newInfo);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return; // Prevent interaction during transition
    // Ignore swipe logic if starting from inside an input or textarea
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    touchStartX.current = e.targetTouches[0].clientX;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || isAnimating) return;
    const currentX = e.targetTouches[0].clientX;
    const diff = currentX - touchStartX.current;
    // Don't limit to Math.abs, we need negative direction for next month
    setDragOffset(diff);
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || isAnimating) return;

    if (dragOffset === 0) {
      setIsDragging(false);
      touchStartX.current = null;
      return; // No animation needed if didn't move
    }

    setIsDragging(false);
    setIsAnimating(true); // Start sliding animation

    const threshold = 100;
    if (dragOffset > threshold) {
      setSlideDirection(-1); // Move to previous
      setSelectedDate(null); // Clear selection on successful month transition
    } else if (dragOffset < -threshold) {
      setSlideDirection(1); // Move to next
      setSelectedDate(null); // Clear selection on successful month transition
    } else {
      setSlideDirection(0);
      setDragOffset(0); // Snap back to center
    }

    touchStartX.current = null;
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // Ignore bubbling transitions from children

    if (isAnimating) {
      if (slideDirection !== 0) {
        const newMonth = new Date(displayMonth);
        newMonth.setMonth(displayMonth.getMonth() + slideDirection);
        setDisplayMonth(newMonth);
      }

      // Reset position with transition disabled
      setSlideDirection(0);
      setDragOffset(0);
      setIsAnimating(false);
    }
  };

  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const startDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const renderMonthGrid = (date: Date) => {
    const totalDays = daysInMonth(date);
    const startDay = startDayOfMonth(date);
    const year = date.getFullYear();
    const month = date.getMonth();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return (
      <div className={styles.calendarSlide}>
        <div className={styles.calendarHeader}>
          <div className={styles.monthLabel}>{monthNames[month]}</div>
        </div>
        <div className={styles.calendarGrid}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className={styles.calendarDay} style={{ opacity: 0.7, fontSize: '0.9rem', borderBottom: 'none' }}>{d}</div>
          ))}

          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className={styles.calendarDay} />
          ))}

          {Array.from({ length: totalDays }).map((_, i) => {
            const day = i + 1;
            const currentDayDate = new Date(year, month, day);
            const isPast = currentDayDate.getTime() < today.getTime();

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = selectedDate === dateStr;
            const hasDateInfo = dateInfos.find(d => d.date === dateStr)?.isDate;

            return (
              <div
                key={i}
                className={`${styles.calendarDay} ${isPast ? styles.pastDay : ''} ${isSelected ? styles.selectedDay : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDate(isSelected ? null : dateStr);
                }}
              >
                <div className={hasDateInfo ? styles.todayCircle : ''}>
                  {hasDateInfo && (
                    <svg className={styles.todaySvg} viewBox="-20 0 730 540" xmlns="http://www.w3.org/2000/svg">
                      <g fill="#F23D47" transform="translate(-45, 0) scale(1.15, 1)">
                        <path d="M 170,410 C 70,320 65,150 230,80 C 410,15 565,85 565,220 C 565,345 460,455 310,515 C 220,545 140,555 85,560 C 140,545 220,515 295,485 C 440,420 535,325 535,220 C 535,110 395,45 240,100 C 105,150 100,305 185,400 Z" />
                      </g>
                    </svg>
                  )}
                  <span className={styles.dayNumber}>{day}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const prevMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1);
  const nextMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1);

  return (
    <div
      className={styles.container}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={() => setSelectedDate(null)}
    >
      <div className={styles.yearLabel}>{displayMonth.getFullYear()}</div>
      {viewMode === 'monthly' ? (
        <>
          <div className={styles.swipeWrapper}>
            <div
              className={styles.calendarSlider}
              onTransitionEnd={handleTransitionEnd}
              style={{
                transform: slideDirection === 0
                  ? `translateX(calc(-33.333% + ${dragOffset}px))`
                  : `translateX(${slideDirection === 1 ? '-66.666%' : '0%'})`,
                transition: isDragging || !isAnimating ? 'none' : 'transform 0.3s ease-out'
              }}
            >
              {renderMonthGrid(prevMonth)}
              {renderMonthGrid(displayMonth)}
              {renderMonthGrid(nextMonth)}
            </div>
          </div>

          {selectedDate && (
            <div className={styles.scheduleCardsContainer} key={selectedDate} onClick={(e) => e.stopPropagation()}>

              <div className={styles.dateControlRow}>
                <label className={styles.dateCheckboxLabel}>
                  <input
                    type="checkbox"
                    className={styles.dateCheckbox}
                    checked={dateInfos.find(d => d.date === selectedDate)?.isDate || false}
                    onChange={(e) => handleDateInfoChange(selectedDate, e.target.checked)}
                  />
                  <span>デートする</span>
                </label>

                {dateInfos.find(d => d.date === selectedDate)?.isDate && (
                  <textarea
                    className={styles.dateDetailInput}
                    placeholder="デートの詳細を入力"
                    value={dateInfos.find(d => d.date === selectedDate)?.timeText || ''}
                    onChange={(e) => handleDateInfoChange(selectedDate, true, e.target.value)}
                    rows={1}
                  />
                )}
              </div>

              <div className={styles.scheduleCard}>
                <div className={styles.scheduleCardUser}>たいせい：</div>
                <input
                  type="text"
                  className={styles.scheduleCardInput}
                  value={schedules.find(s => s.date === selectedDate && s.userId === 'taisei')?.content || ''}
                  onChange={(e) => handleScheduleChange('taisei', e.target.value, selectedDate)}
                />
              </div>

              <div className={styles.scheduleCard}>
                <div className={styles.scheduleCardUser}>ひな：</div>
                <input
                  type="text"
                  className={styles.scheduleCardInput}
                  value={schedules.find(s => s.date === selectedDate && s.userId === 'hina')?.content || ''}
                  onChange={(e) => handleScheduleChange('hina', e.target.value, selectedDate)}
                />
              </div>
            </div>
          )}
        </>
      ) : viewMode === 'weekly' ? (
        <div className={styles.emptyState}>
          <LayoutList size={48} strokeWidth={1.5} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <div>Weekly Schedule</div>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <ClipboardPen size={48} strokeWidth={1.5} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <div>Daily Tasks</div>
        </div>
      )}

      {/* Bottom Navigation Banner */}
      <div className={styles.bottomNav}>
        <div className={styles.navInner}>
          <button
            onClick={() => setViewMode('monthly')}
            className={viewMode === 'monthly' ? styles.navButtonActive : styles.navButton}
          >
            <CalendarIcon size={24} strokeWidth={1.5} />
            <span className={styles.navLabel}>Monthly</span>
          </button>

          <button
            onClick={() => setViewMode('weekly')}
            className={viewMode === 'weekly' ? styles.navButtonActive : styles.navButton}
          >
            <LayoutList size={24} strokeWidth={1.5} />
            <span className={styles.navLabel}>Weekly</span>
          </button>

          <button
            onClick={() => setViewMode('daily')}
            className={viewMode === 'daily' ? styles.navButtonActive : styles.navButton}
          >
            <ClipboardPen size={24} strokeWidth={1.5} />
            <span className={styles.navLabel}>Daily</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
