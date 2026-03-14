import { useState } from 'react';
import { Calendar as CalendarIcon, LayoutList, ClipboardPen } from 'lucide-react';
import styles from './App.module.css';

function App() {
  const [viewMode, setViewMode] = useState<'monthly' | 'weekly' | 'daily'>('monthly');


  return (
    <div className={styles.container}>
      {viewMode === 'monthly' ? (
        <div className={styles.calendarContainer}>
          <div className={styles.calendarHeader}>
            <div style={{ fontSize: '1.4rem' }}>March 2026</div>
          </div>
          <div className={styles.calendarGrid}>
            {/* Simple mock grid */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className={styles.calendarDay} style={{ opacity: 0.7, fontSize: '0.9rem' }}>{d}</div>
            ))}
            {Array.from({ length: 31 }).map((_, i) => (
              <div key={i} className={styles.calendarDay}>
                {i + 1}
              </div>
            ))}
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
