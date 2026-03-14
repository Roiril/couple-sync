import { useState } from 'react';
import { Calendar as CalendarIcon, LayoutList, ClipboardPen } from 'lucide-react';
import styles from './App.module.css';

function App() {
  const [viewMode, setViewMode] = useState<'monthly' | 'weekly' | 'daily'>('monthly');
  const [displayMonth, setDisplayMonth] = useState(new Date(2026, 2, 1)); // March 2026

  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (Math.abs(diff) > 50) {
      const newMonth = new Date(displayMonth);
      if (diff > 0) {
        newMonth.setMonth(displayMonth.getMonth() + 1);
      } else {
        newMonth.setMonth(displayMonth.getMonth() - 1);
      }
      setDisplayMonth(newMonth);
    }
    setTouchStart(null);
  };

  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const startDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className={styles.container}>
      {viewMode === 'monthly' ? (
        <div
          className={styles.calendarContainer}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className={styles.calendarHeader}>
            <div className={styles.yearLabel}>{displayMonth.getFullYear()}</div>
            <div className={styles.monthLabel}>{monthNames[displayMonth.getMonth()]}</div>
          </div>
          <div className={styles.calendarGrid}>
            {/* Weekday headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className={styles.calendarDay} style={{ opacity: 0.7, fontSize: '0.9rem', borderBottom: 'none' }}>{d}</div>
            ))}

            {/* Empty cells for start day offset */}
            {Array.from({ length: startDayOfMonth(displayMonth) }).map((_, i) => (
              <div key={`empty-${i}`} className={styles.calendarDay} />
            ))}

            {/* Actual days */}
            {Array.from({ length: daysInMonth(displayMonth) }).map((_, i) => {
              const day = i + 1;
              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const currentDayDate = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), day);

              const isToday = currentDayDate.getTime() === today.getTime();
              const isPast = currentDayDate.getTime() < today.getTime();

              return (
                <div key={i} className={`${styles.calendarDay} ${isPast ? styles.pastDay : ''}`}>
                  <div className={isToday ? styles.todayCircle : ''}>
                    {isToday && (
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
