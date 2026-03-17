import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { supabase } from './supabase';

export interface CoupleEvent {
    id: string;
    title: string;
    description?: string;
    startDate: string; // ISO string
    endDate?: string;
    isAllDay: boolean;
    location?: string;
    isDeleted?: boolean;
    isDirty?: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface DateProposal {
    id: string;
    eventId?: string; // If linked to an existing event
    title: string;
    proposedDates: string[]; // Array of ISO strings
    status: 'pending' | 'accepted' | 'declined';
    isDeleted?: boolean;
    isDirty?: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface DailySchedule {
    id: string;
    date: string; // 'YYYY-MM-DD'
    userId: string; // 'taisei' | 'hina'
    content: string;
    isDeleted?: boolean;
    isDirty?: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface DateInfo {
    id: string; // 'YYYY-MM-DD'
    date: string; // 'YYYY-MM-DD'
    isDate: boolean;
    status?: 'confirmed' | 'tentative' | null;
    timeText?: string;
    isAnniversary?: boolean;
    anniversaryName?: string;
    isDeleted?: boolean;
    isDirty?: boolean;
    createdAt: number;
    updatedAt: number;
}

interface CoupleSyncDB extends DBSchema {
    events: {
        key: string;
        value: CoupleEvent;
        indexes: { 'by-updated': number, 'by-dirty': number };
    };
    proposals: {
        key: string;
        value: DateProposal;
        indexes: { 'by-updated': number, 'by-dirty': number };
    };
    daily_schedules: {
        key: string; // date_userId
        value: DailySchedule;
        indexes: { 'by-updated': number, 'by-date': string, 'by-dirty': number };
    };
    date_infos: {
        key: string; // date
        value: DateInfo;
        indexes: { 'by-updated': number, 'by-dirty': number };
    };
    metadata: {
        key: string;
        value: any;
    };
}

let dbPromise: Promise<IDBPDatabase<CoupleSyncDB>> | null = null;

export function initDB() {
    if (!dbPromise) {
        dbPromise = openDB<CoupleSyncDB>('couple-sync', 4, {
            upgrade(db, oldVersion, _newVersion, transaction) {
                if (oldVersion < 3) {
                    if (!db.objectStoreNames.contains('events')) {
                        const store = db.createObjectStore('events', { keyPath: 'id' });
                        store.createIndex('by-updated', 'updatedAt');
                    }
                    if (!db.objectStoreNames.contains('proposals')) {
                        const store = db.createObjectStore('proposals', { keyPath: 'id' });
                        store.createIndex('by-updated', 'updatedAt');
                    }
                    if (!db.objectStoreNames.contains('daily_schedules')) {
                        const store = db.createObjectStore('daily_schedules', { keyPath: 'id' });
                        store.createIndex('by-updated', 'updatedAt');
                        store.createIndex('by-date', 'date');
                    }
                    if (!db.objectStoreNames.contains('date_infos')) {
                        const store = db.createObjectStore('date_infos', { keyPath: 'id' });
                        store.createIndex('by-updated', 'updatedAt');
                    }
                    if (!db.objectStoreNames.contains('metadata')) {
                        db.createObjectStore('metadata');
                    }
                }
                if (oldVersion < 4) {
                    const storeNames: (keyof CoupleSyncDB)[] = ['events', 'proposals', 'daily_schedules', 'date_infos'];
                    storeNames.forEach(s => {
                        const store = transaction.objectStore(s as any) as any;
                        if (!store.indexNames.contains('by-dirty')) {
                            store.createIndex('by-dirty', 'isDirty');
                        }
                    });
                }
            },
        });
    }
    return dbPromise;
}

// --- Dirty Flag Helpers ---

async function markClean(storeName: 'events' | 'proposals' | 'daily_schedules' | 'date_infos', id: string) {
    const db = await initDB();
    const tx = db.transaction(storeName, 'readwrite');
    const record = await tx.store.get(id);
    if (record && record.isDirty) {
        record.isDirty = false;
        await tx.store.put(record);
    }
    await tx.done;
}

// --- Debounced Push ---

type PushFn<T> = (data: T) => Promise<void>;

interface DebouncedEntry<T> {
    timer: ReturnType<typeof setTimeout>;
    data: T;
}

const debounceTimers = new Map<string, DebouncedEntry<any>>();
const DEBOUNCE_MS = 300;

function debouncedPush<T extends { id: string }>(
    key: string,
    data: T,
    pushFn: PushFn<T>
) {
    const existing = debounceTimers.get(key);
    if (existing) {
        clearTimeout(existing.timer);
    }
    const timer = setTimeout(() => {
        debounceTimers.delete(key);
        void pushWithRetry(key, data, pushFn);
    }, DEBOUNCE_MS);
    debounceTimers.set(key, { timer, data });
}

// --- Retry Queue ---

interface RetryEntry<T = any> {
    key: string;
    data: T;
    pushFn: PushFn<T>;
}

const retryQueue: RetryEntry[] = [];

async function pushWithRetry<T extends { id: string }>(
    key: string,
    data: T,
    pushFn: PushFn<T>
) {
    try {
        await pushFn(data);
    } catch {
        const idx = retryQueue.findIndex(e => e.key === key);
        if (idx >= 0) retryQueue.splice(idx, 1);
        retryQueue.push({ key, data, pushFn });
    }
}

async function flushRetryQueue() {
    const entries = retryQueue.splice(0, retryQueue.length);
    for (const entry of entries) {
        try {
            await entry.pushFn(entry.data);
        } catch {
            retryQueue.push(entry);
        }
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        void flushRetryQueue();
    });
}

// --- Events API ---

export async function getEvents(): Promise<CoupleEvent[]> {
    const db = await initDB();
    const events = await db.getAllFromIndex('events', 'by-updated');
    return events.filter(e => !e.isDeleted).reverse();
}

export async function saveEvent(event: CoupleEvent): Promise<void> {
    const db = await initDB();
    const updatedEvent = { 
        ...event, 
        isDeleted: event.isDeleted ?? false, 
        isDirty: true, 
        updatedAt: Date.now() 
    };
    await db.put('events', updatedEvent);
    debouncedPush(`event:${updatedEvent.id}`, updatedEvent, pushEventRaw);
}

export async function deleteEvent(id: string): Promise<void> {
    const db = await initDB();
    const event = await db.get('events', id);
    if (event) {
        const updatedEvent = { ...event, isDeleted: true, isDirty: true, updatedAt: Date.now() };
        await db.put('events', updatedEvent);
        debouncedPush(`event:${updatedEvent.id}`, updatedEvent, pushEventRaw);
    }
}

// --- Proposals API ---

export async function getProposals(): Promise<DateProposal[]> {
    const db = await initDB();
    const proposals = await db.getAllFromIndex('proposals', 'by-updated');
    return proposals.filter(p => !p.isDeleted).reverse();
}

export async function saveProposal(proposal: DateProposal): Promise<void> {
    const db = await initDB();
    const updatedProposal = { 
        ...proposal, 
        isDeleted: proposal.isDeleted ?? false, 
        isDirty: true, 
        updatedAt: Date.now() 
    };
    await db.put('proposals', updatedProposal);
    debouncedPush(`proposal:${updatedProposal.id}`, updatedProposal, pushProposalRaw);
}

// --- Daily Schedules API ---

export async function getDailySchedules(date: string): Promise<DailySchedule[]> {
    const db = await initDB();
    const schedules = await db.getAllFromIndex('daily_schedules', 'by-date', date);
    return schedules.filter(s => !s.isDeleted);
}

export async function saveDailySchedule(schedule: DailySchedule): Promise<void> {
    const db = await initDB();
    const updatedSchedule = { 
        ...schedule, 
        isDeleted: schedule.isDeleted ?? false, 
        isDirty: true, 
        updatedAt: Date.now() 
    };
    await db.put('daily_schedules', updatedSchedule);
    debouncedPush(`schedule:${updatedSchedule.id}`, updatedSchedule, pushDailyScheduleRaw);
}

// --- Date Infos API ---

export async function getDateInfos(): Promise<DateInfo[]> {
    const db = await initDB();
    const infos = await db.getAllFromIndex('date_infos', 'by-updated');
    return infos.filter(i => !i.isDeleted);
}

export async function saveDateInfo(info: DateInfo): Promise<void> {
    const db = await initDB();
    const updatedInfo = { 
        ...info, 
        isDeleted: info.isDeleted ?? false, 
        isDirty: true, 
        updatedAt: Date.now() 
    };
    await db.put('date_infos', updatedInfo);
    debouncedPush(`dateinfo:${updatedInfo.id}`, updatedInfo, pushDateInfoRaw);
}

// --- Push Functions (raw) ---

async function pushEventRaw(event: CoupleEvent) {
    const { error } = await supabase
        .from('couple_events')
        .upsert({
            id: event.id,
            title: event.title,
            description: event.description,
            start_date: event.startDate,
            end_date: event.endDate,
            is_all_day: event.isAllDay,
            location: event.location,
            is_deleted: event.isDeleted,
            created_at: event.createdAt,
            updated_at: event.updatedAt
        });
    if (error) throw error;
    await markClean('events', event.id);
}

async function pushProposalRaw(proposal: DateProposal) {
    const { error } = await supabase
        .from('date_proposals')
        .upsert({
            id: proposal.id,
            event_id: proposal.eventId,
            title: proposal.title,
            proposed_dates: proposal.proposedDates,
            status: proposal.status,
            is_deleted: proposal.isDeleted,
            created_at: proposal.createdAt,
            updated_at: proposal.updatedAt
        });
    if (error) throw error;
    await markClean('proposals', proposal.id);
}

async function pushDailyScheduleRaw(schedule: DailySchedule) {
    const { error } = await supabase
        .from('daily_schedules')
        .upsert({
            id: schedule.id,
            date: schedule.date,
            user_id: schedule.userId,
            content: schedule.content,
            is_deleted: schedule.isDeleted,
            created_at: schedule.createdAt,
            updated_at: schedule.updatedAt
        });
    if (error) throw error;
    await markClean('daily_schedules', schedule.id);
}

async function pushDateInfoRaw(info: DateInfo) {
    const { error } = await supabase
        .from('date_infos')
        .upsert({
            id: info.id,
            date: info.date,
            is_date: info.isDate,
            status: info.status,
            time_text: info.timeText,
            is_anniversary: info.isAnniversary,
            anniversary_name: info.anniversaryName,
            is_deleted: info.isDeleted,
            created_at: info.createdAt,
            updated_at: info.updatedAt
        });
    if (error) throw error;
    await markClean('date_infos', info.id);
}

async function pushDirtyRecords() {
    const db = await initDB();
    const stores: (keyof CoupleSyncDB)[] = ['events', 'proposals', 'daily_schedules', 'date_infos'];
    
    for (const s of stores) {
        if (s === 'metadata') continue;
        const all = await db.getAll(s as any);
        const dirty = all.filter((r: any) => r.isDirty);
        for (const r of dirty) {
            if (s === 'events') void pushWithRetry(`event:${r.id}`, r, pushEventRaw);
            if (s === 'proposals') void pushWithRetry(`proposal:${r.id}`, r, pushProposalRaw);
            if (s === 'daily_schedules') void pushWithRetry(`schedule:${r.id}`, r, pushDailyScheduleRaw);
            if (s === 'date_infos') void pushWithRetry(`dateinfo:${r.id}`, r, pushDateInfoRaw);
        }
    }
}

// --- Sync Logic ---

let isSyncing = false;

export async function syncFromSupabase() {
    if (isSyncing) return;
    isSyncing = true;

    try {
        const db = await initDB();
        await pushDirtyRecords();

        const now = Date.now();

        // Pull Events
        const { data: remoteEvents, error: eventsError } = await supabase
            .from('couple_events')
            .select();
        if (eventsError) throw eventsError;
        if (remoteEvents && remoteEvents.length > 0) {
            const tx = db.transaction('events', 'readwrite');
            for (const r of remoteEvents) {
                const local = await tx.store.get(r.id);
                if (!local || !local.isDirty) {
                    await tx.store.put({
                        id: r.id,
                        title: r.title,
                        description: r.description,
                        startDate: r.start_date,
                        endDate: r.end_date,
                        isAllDay: r.is_all_day,
                        location: r.location,
                        isDeleted: r.is_deleted,
                        isDirty: false,
                        createdAt: r.created_at,
                        updatedAt: r.updated_at
                    });
                }
            }
            await tx.done;
        }

        // Pull Proposals
        const { data: remoteProposals, error: proposalsError } = await supabase
            .from('date_proposals')
            .select();
        if (proposalsError) throw proposalsError;
        if (remoteProposals && remoteProposals.length > 0) {
            const tx = db.transaction('proposals', 'readwrite');
            for (const r of remoteProposals) {
                const local = await tx.store.get(r.id);
                if (!local || !local.isDirty) {
                    await tx.store.put({
                        id: r.id,
                        eventId: r.event_id,
                        title: r.title,
                        proposedDates: r.proposed_dates,
                        status: r.status,
                        isDeleted: r.is_deleted,
                        isDirty: false,
                        createdAt: r.created_at,
                        updatedAt: r.updated_at
                    });
                }
            }
            await tx.done;
        }

        // Pull Daily Schedules
        const { data: remoteSchedules, error: schedulesError } = await supabase
            .from('daily_schedules')
            .select();
        if (schedulesError) throw schedulesError;
        if (remoteSchedules && remoteSchedules.length > 0) {
            const tx = db.transaction('daily_schedules', 'readwrite');
            for (const r of remoteSchedules) {
                const local = await tx.store.get(r.id);
                if (!local || !local.isDirty) {
                    await tx.store.put({
                        id: r.id,
                        date: r.date,
                        userId: r.user_id,
                        content: r.content,
                        isDeleted: r.is_deleted,
                        isDirty: false,
                        createdAt: r.created_at,
                        updatedAt: r.updated_at
                    });
                }
            }
            await tx.done;
        }

        // Pull Date Infos
        const { data: remoteDateInfos, error: dateInfosError } = await supabase
            .from('date_infos')
            .select();
        if (dateInfosError) throw dateInfosError;
        if (remoteDateInfos && remoteDateInfos.length > 0) {
            const tx = db.transaction('date_infos', 'readwrite');
            for (const r of remoteDateInfos) {
                const local = await tx.store.get(r.id);
                if (!local || !local.isDirty) {
                    await tx.store.put({
                        id: r.id,
                        date: r.date,
                        isDate: r.is_date,
                        status: r.status,
                        timeText: r.time_text,
                        isAnniversary: r.is_anniversary,
                        anniversaryName: r.anniversary_name,
                        isDeleted: r.is_deleted,
                        isDirty: false,
                        createdAt: r.created_at,
                        updatedAt: r.updated_at
                    });
                }
            }
            await tx.done;
        }

        await db.put('metadata', now, 'lastSyncedAt');
        if (retryQueue.length > 0) void flushRetryQueue();
    } catch (e) {
        console.error('Failed to sync from Supabase', e);
    } finally {
        isSyncing = false;
    }
}

const POLL_INTERVAL_MS = 30_000;

export function subscribeToSupabase(onUpdate: () => void) {
    const channels = [
        'public:couple_events',
        'public:date_proposals',
        'public:daily_schedules',
        'public:date_infos'
    ].map(name => 
        supabase.channel(name)
            .on('postgres_changes', { event: '*', schema: 'public', table: name.split(':')[1] }, () => {
                syncFromSupabase().then(onUpdate);
            })
            .subscribe()
    );

    const pollTimer = setInterval(() => {
        syncFromSupabase().then(onUpdate);
    }, POLL_INTERVAL_MS);

    const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
            syncFromSupabase().then(onUpdate);
        }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
        channels.forEach(ch => supabase.removeChannel(ch));
        clearInterval(pollTimer);
        document.removeEventListener('visibilitychange', handleVisibility);
    };
}
