import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, Heart, Gamepad2 } from 'lucide-react';
import styles from './App.module.css';
import { getDailySchedules, saveDailySchedule, type DailySchedule, getDateInfos, saveDateInfo, type DateInfo, syncFromSupabase, subscribeToSupabase } from './db';
import Tetris from './games/Tetris/Tetris';
import { fetchHighScore } from './games/highScoreApi';

function App() {
  // ... (state definitions)
  const [viewMode, setViewMode] = useState<'monthly' | 'anniversary' | 'minigame'>('monthly');
  const [selectedMiniGame, setSelectedMiniGame] = useState<'tetris' | null>(null);
  const [tetrisBestScore, setTetrisBestScore] = useState<number>(0);
  const [displayMonth, setDisplayMonth] = useState(new Date(2026, 2, 1)); // March 2026

  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [slideDirection, setSlideDirection] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedDateRef = useRef<string | null>(null);
  const [schedules, setSchedules] = useState<DailySchedule[]>([]);
  const [dateInfos, setDateInfos] = useState<DateInfo[]>([]);
  const [isSyncing, setIsSyncing] = useState(true);

  const handleMiniGameBack = useCallback(() => {
    setSelectedMiniGame(null);
  }, []);

  // Keep ref in sync with state so Realtime callbacks always see current value
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    // Initial sync
    setIsSyncing(true);
    syncFromSupabase().then(() => {
      loadAllDateInfos();
      setIsSyncing(false);
    }).catch(() => {
      setIsSyncing(false);
    });

    // Subscribe to changes — use ref to avoid stale closure
    const unsubscribe = subscribeToSupabase(() => {
      loadAllDateInfos();
      const currentDate = selectedDateRef.current;
      if (currentDate) {
        loadSchedules(currentDate);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadAllDateInfos = async () => {
    const infos = await getDateInfos();
    setDateInfos(infos);
  };

  // Clean up schedules when display month changes
  useEffect(() => {
    setSchedules([]);
  }, [displayMonth]);

  useEffect(() => {
    if (selectedDate) {
      loadSchedules(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (viewMode === 'minigame') {
      fetchHighScore('tetris').then(setTetrisBestScore).catch(() => {});
    }
  }, [viewMode]);

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

  const handleDateInfoChange = async (
    dateAtTimeOfRender: string, 
    isDate: boolean, 
    status?: 'confirmed' | 'tentative', 
    timeText?: string,
    isAnniversary?: boolean,
    anniversaryName?: string
  ) => {
    const monthDay = dateAtTimeOfRender.slice(5);
    
    // 1. Handle Anniversary changes (MM-DD recurrence)
    if (isAnniversary !== undefined || anniversaryName !== undefined) {
      const sourceAnniv = dateInfos.find(d => d.isAnniversary && d.date.endsWith(monthDay));
      const targetDate = sourceAnniv ? sourceAnniv.date : dateAtTimeOfRender;
      
      const existingIndex = dateInfos.findIndex(d => d.date === targetDate);
      const existing = existingIndex >= 0 ? dateInfos[existingIndex] : null;
      
      const newInfo: DateInfo = {
        id: targetDate,
        date: targetDate,
        isDate: existing?.isDate || (targetDate === dateAtTimeOfRender ? isDate : false),
        status: existing?.status || (targetDate === dateAtTimeOfRender ? (status || null) : null),
        timeText: existing?.timeText || (targetDate === dateAtTimeOfRender ? (timeText || '') : ''),
        isAnniversary: isAnniversary !== undefined ? isAnniversary : existing?.isAnniversary || false,
        anniversaryName: anniversaryName !== undefined ? anniversaryName : existing?.anniversaryName || '',
        createdAt: existing ? existing.createdAt : Date.now(),
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
      return;
    }

    // 2. Handle Date Status changes (Specific YYYY-MM-DD)
    const existingIndex = dateInfos.findIndex(d => d.date === dateAtTimeOfRender);
    const existing = existingIndex >= 0 ? dateInfos[existingIndex] : null;
    
    const newInfo: DateInfo = {
      id: dateAtTimeOfRender,
      date: dateAtTimeOfRender,
      isDate,
      status: status !== undefined ? status : (isDate ? (existing?.status || null) : null),
      timeText: timeText !== undefined ? timeText : existing?.timeText || '',
      isAnniversary: existing?.isAnniversary || false,
      anniversaryName: existing?.anniversaryName || '',
      createdAt: existing ? existing.createdAt : Date.now(),
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
            const dateInfo = dateInfos.find(d => d.date === dateStr);
            const hasDateInfo = dateInfo?.isDate;
            const monthDay = dateStr.slice(5); // MM-DD
            const isAnniversary = dateInfos.some(info => info.isAnniversary && info.date.endsWith(monthDay));

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
                  {hasDateInfo && !isAnniversary && (
                    <svg 
                      className={`${styles.todaySvg} ${dateInfos.find(d => d.date === dateStr)?.status === 'tentative' ? styles.tentativeDate : ''}`} 
                      viewBox="-20 0 730 540" 
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <g fill="#F23D47" transform="translate(-45, 0) scale(1.15, 1)">
                        <path d="M 170,410 C 70,320 65,150 230,80 C 410,15 565,85 565,220 C 565,345 460,455 310,515 C 220,545 140,555 85,560 C 140,545 220,515 295,485 C 440,420 535,325 535,220 C 535,110 395,45 240,100 C 105,150 100,305 185,400 Z" />
                      </g>
                    </svg>
                  )}
                  {isAnniversary && (
                    (() => {
                      const annivColorClass = dateInfo?.status === 'confirmed'
                        ? styles.anniversarySvgConfirmed
                        : dateInfo?.status === 'tentative'
                          ? styles.anniversarySvgTentative
                          : styles.anniversarySvgDefault;
                      return (
                        <div className={styles.anniversaryOverlay}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className={`${styles.anniversarySvg} ${annivColorClass}`}>
                              <g transform="translate(0, 0)" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="50" cy="60" r="22" />
                                  <path d="M70,55 
                                          C85,40 100,70 80,75 
                                          C90,95 65,105 55,85 
                                          C45,105 15,95 25,75 
                                          C5,70 5,40 25,45 
                                          C15,25 45,15 50,35 
                                          C60,15 90,25 75,45" />
                              </g>
                          </svg>
                        </div>
                      );
                    })()
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
      {viewMode !== 'minigame' && (
        <div className={styles.yearLabel}>{displayMonth.getFullYear()}</div>
      )}
      {viewMode === 'monthly' ? (
        <>
          <div className={styles.swipeWrapper} style={{ opacity: isSyncing ? 0.5 : 1, transition: 'opacity 0.3s', pointerEvents: isSyncing ? 'none' : 'auto' }}>
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
                <div className={styles.statusSwitch}>
                  <button
                    className={`${styles.statusButton} ${dateInfos.find(d => d.date === selectedDate)?.status === 'confirmed' ? styles.statusButtonActiveConfirmed : ''}`}
                    onClick={() => {
                      const current = dateInfos.find(d => d.date === selectedDate);
                      if (current?.status === 'confirmed') {
                        handleDateInfoChange(selectedDate, false, undefined);
                      } else {
                        handleDateInfoChange(selectedDate, true, 'confirmed');
                      }
                    }}
                  >
                    デート確定
                  </button>
                  <button
                    className={`${styles.statusButton} ${dateInfos.find(d => d.date === selectedDate)?.status === 'tentative' ? styles.statusButtonActiveTentative : ''}`}
                    onClick={() => {
                      const current = dateInfos.find(d => d.date === selectedDate);
                      if (current?.status === 'tentative') {
                        handleDateInfoChange(selectedDate, false, undefined);
                      } else {
                        handleDateInfoChange(selectedDate, true, 'tentative');
                      }
                    }}
                  >
                    調整中・仮
                  </button>
                </div>

                {dateInfos.find(d => d.date === selectedDate)?.isDate && (
                  <textarea
                    className={styles.dateDetailInput}
                    placeholder="デートの詳細を入力"
                    value={dateInfos.find(d => d.date === selectedDate)?.timeText || ''}
                    onChange={(e) => handleDateInfoChange(selectedDate, true, undefined, e.target.value)}
                    rows={1}
                  />
                )}
              </div>

              <div className={styles.scheduleCard}>
                <div className={styles.scheduleCardUser}>たい：</div>
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

              {(() => {
                const monthDay = selectedDate.slice(5);
                const sourceAnniv = dateInfos.find(info => info.isAnniversary && info.date.endsWith(monthDay));
                const isAnniversary = !!sourceAnniv;

                return (
                  <div className={styles.anniversaryRow}>
                    <button
                      className={`${styles.statusButton} ${styles.statusButtonAnniversary} ${isAnniversary ? styles.statusButtonActiveAnniversary : ''}`}
                      onClick={() => {
                        const current = dateInfos.find(d => d.date === selectedDate);
                        handleDateInfoChange(selectedDate, !!current?.isDate, undefined, undefined, !isAnniversary);
                      }}
                    >
                      {isAnniversary ? '記念日' : '記念日にする'}
                    </button>
                    {isAnniversary && (
                      <input
                        type="text"
                        className={styles.anniversaryInput}
                        placeholder="何の記念日ですか？"
                        value={sourceAnniv.anniversaryName || ''}
                        onChange={(e) => handleDateInfoChange(selectedDate, !!dateInfos.find(d => d.date === selectedDate)?.isDate, undefined, undefined, true, e.target.value)}
                      />
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </>
      ) : viewMode === 'anniversary' ? (
        <div className={styles.anniversaryList}>
          <div className={styles.anniversaryTitle}>Anniversaries</div>
          {dateInfos
            .filter(info => info.isAnniversary)
            .sort((a, b) => {
              const aMonth = parseInt(a.date.split('-')[1]);
              const aDay = parseInt(a.date.split('-')[2]);
              const bMonth = parseInt(b.date.split('-')[1]);
              const bDay = parseInt(b.date.split('-')[2]);
              if (aMonth !== bMonth) return aMonth - bMonth;
              return aDay - bDay;
            })
            .map(info => {
              const month = parseInt(info.date.split('-')[1]);
              const day = parseInt(info.date.split('-')[2]);
              return (
                <div key={info.id} className={styles.anniversaryItem}>
                  <div className={styles.anniversaryDateContainer}>
                    <div className={styles.anniversaryDayLarge}>{month}/{day}</div>
                  </div>
                  <div className={styles.anniversaryContent}>
                    <div className={styles.anniversaryName}>
                      {info.anniversaryName || '無題の記念日'}
                    </div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className={styles.anniversaryItemIcon}>
                    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="50" cy="60" r="22" />
                      <path d="M70,55 C85,40 100,70 80,75 C90,95 65,105 55,85 C45,105 15,95 25,75 C5,70 5,40 25,45 C15,25 45,15 50,35 C60,15 90,25 75,45" />
                    </g>
                  </svg>
                </div>
              );
            })}
          {dateInfos.filter(info => info.isAnniversary).length === 0 && (
            <div className={styles.emptyState}>
              <Heart size={48} strokeWidth={1.5} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <div>記念日がまだありません</div>
            </div>
          )}
        </div>
      ) : selectedMiniGame === 'tetris' ? (
        <Tetris onBack={handleMiniGameBack} />
      ) : (
        <div className={styles.anniversaryList}>
          <div className={styles.anniversaryTitle}>Mini Games</div>
          
          <div className={styles.anniversaryItem} onClick={() => setSelectedMiniGame('tetris')} style={{ cursor: 'pointer' }}>
            <div className={styles.anniversaryDateContainer}>
              <div className={styles.anniversaryDayLarge} style={{ fontSize: '1rem' }}>Play</div>
            </div>
            <div className={styles.anniversaryContent}>
              <div className={styles.anniversaryName} style={{ fontSize: '1.2rem', letterSpacing: '0.1em' }}>
                Tetris
              </div>
              {tetrisBestScore > 0 && (
                <div className={styles.miniGameBestScore}>
                  BEST: {tetrisBestScore}
                </div>
              )}
            </div>
            <Gamepad2 size={80} className={styles.anniversaryItemIcon} />
          </div>
        </div>
      )}

      {/* Bottom Navigation Banner */}
      {selectedMiniGame !== 'tetris' && (
        <div className={styles.bottomNav}>
          <div className={styles.navInner}>
            <button
              onClick={() => setViewMode('monthly')}
              className={viewMode === 'monthly' ? styles.navButtonActive : styles.navButton}
            >
              <CalendarIcon size={24} strokeWidth={1.5} />
              <span className={styles.navLabel}>マンスリー</span>
            </button>

            <button
              onClick={() => setViewMode('anniversary')}
              className={viewMode === 'anniversary' ? styles.navButtonActive : styles.navButton}
            >
              <Heart size={24} strokeWidth={1.5} />
              <span className={styles.navLabel}>アニバーサリー</span>
            </button>

            <button
              onClick={() => setViewMode('minigame')}
              className={viewMode === 'minigame' ? styles.navButtonActive : styles.navButton}
            >
              <Gamepad2 size={24} strokeWidth={1.5} />
              <span className={styles.navLabel}>ミニゲーム</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
