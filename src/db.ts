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
    createdAt: number;
    updatedAt: number;
}

export interface DailySchedule {
    id: string;
    date: string; // 'YYYY-MM-DD'
    userId: string; // 'taisei' | 'hina'
    content: string;
    isDeleted?: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface DateInfo {
    id: string; // 'YYYY-MM-DD'
    date: string; // 'YYYY-MM-DD'
    isDate: boolean;
    timeText?: string;
    isDeleted?: boolean;
    createdAt: number;
    updatedAt: number;
}

interface CoupleSyncDB extends DBSchema {
    events: {
        key: string;
        value: CoupleEvent;
        indexes: { 'by-updated': number };
    };
    proposals: {
        key: string;
        value: DateProposal;
        indexes: { 'by-updated': number };
    };
    daily_schedules: {
        key: string; // date_userId
        value: DailySchedule;
        indexes: { 'by-updated': number, 'by-date': string };
    };
    date_infos: {
        key: string; // date
        value: DateInfo;
        indexes: { 'by-updated': number };
    };
    metadata: {
        key: string;
        value: any;
    };
}

let dbPromise: Promise<IDBPDatabase<CoupleSyncDB>> | null = null;

export function initDB() {
    if (!dbPromise) {
        dbPromise = openDB<CoupleSyncDB>('couple-sync', 3, {
            upgrade(db) {
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
            },
        });
    }
    return dbPromise;
}

// --- Events API ---

export async function getEvents(): Promise<CoupleEvent[]> {
    const db = await initDB();
    const events = await db.getAllFromIndex('events', 'by-updated');
    return events.filter(e => !e.isDeleted).reverse();
}

export async function saveEvent(event: CoupleEvent): Promise<void> {
    const db = await initDB();
    const updatedEvent = { ...event, isDeleted: event.isDeleted ?? false, updatedAt: Date.now() };
    await db.put('events', updatedEvent);
    void pushEvent(updatedEvent);
}

export async function deleteEvent(id: string): Promise<void> {
    const db = await initDB();
    const event = await db.get('events', id);
    if (event) {
        const updatedEvent = { ...event, isDeleted: true, updatedAt: Date.now() };
        await db.put('events', updatedEvent);
        void pushEvent(updatedEvent);
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
    const updatedProposal = { ...proposal, isDeleted: proposal.isDeleted ?? false, updatedAt: Date.now() };
    await db.put('proposals', updatedProposal);
    void pushProposal(updatedProposal);
}

// --- Daily Schedules API ---

export async function getDailySchedules(date: string): Promise<DailySchedule[]> {
    const db = await initDB();
    const schedules = await db.getAllFromIndex('daily_schedules', 'by-date', date);
    return schedules.filter(s => !s.isDeleted);
}

export async function saveDailySchedule(schedule: DailySchedule): Promise<void> {
    const db = await initDB();
    const updatedSchedule = { ...schedule, isDeleted: schedule.isDeleted ?? false, updatedAt: Date.now() };
    await db.put('daily_schedules', updatedSchedule);
    void pushDailySchedule(updatedSchedule);
}

// --- Date Infos API ---

export async function getDateInfos(): Promise<DateInfo[]> {
    const db = await initDB();
    const infos = await db.getAllFromIndex('date_infos', 'by-updated');
    return infos.filter(i => !i.isDeleted);
}

export async function saveDateInfo(info: DateInfo): Promise<void> {
    const db = await initDB();
    const updatedInfo = { ...info, isDeleted: info.isDeleted ?? false, updatedAt: Date.now() };
    await db.put('date_infos', updatedInfo);
    void pushDateInfo(updatedInfo);
}

// --- Sync Logic ---

async function pushEvent(event: CoupleEvent) {
    try {
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
    } catch (e) {
        console.error('Failed to push event to Supabase', e);
    }
}

async function pushProposal(proposal: DateProposal) {
    try {
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
    } catch (e) {
        console.error('Failed to push proposal to Supabase', e);
    }
}

async function pushDailySchedule(schedule: DailySchedule) {
    try {
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
    } catch (e) {
        console.error('Failed to push daily schedule to Supabase', e);
    }
}

async function pushDateInfo(info: DateInfo) {
    try {
        const { error } = await supabase
            .from('date_infos')
            .upsert({
                id: info.id,
                date: info.date,
                is_date: info.isDate,
                time_text: info.timeText,
                is_deleted: info.isDeleted,
                created_at: info.createdAt,
                updated_at: info.updatedAt
            });
        if (error) throw error;
    } catch (e) {
        console.error('Failed to push date info to Supabase', e);
    }
}

export async function syncFromSupabase() {
    const db = await initDB();
    const lastSyncedAt = (await db.get('metadata', 'lastSyncedAt')) || 0;
    const now = Date.now();

    try {
        // Pull Events
        const { data: remoteEvents, error: eventsError } = await supabase
            .from('couple_events')
            .select()
            .gt('updated_at', lastSyncedAt);
        
        if (eventsError) throw eventsError;

        if (remoteEvents && remoteEvents.length > 0) {
            const tx = db.transaction('events', 'readwrite');
            for (const r of remoteEvents) {
                const local = await tx.store.get(r.id);
                if (!local || r.updated_at > local.updatedAt) {
                    await tx.store.put({
                        id: r.id,
                        title: r.title,
                        description: r.description,
                        startDate: r.start_date,
                        endDate: r.end_date,
                        isAllDay: r.is_all_day,
                        location: r.location,
                        isDeleted: r.is_deleted,
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
            .select()
            .gt('updated_at', lastSyncedAt);
        
        if (proposalsError) throw proposalsError;

        if (remoteProposals && remoteProposals.length > 0) {
            const tx = db.transaction('proposals', 'readwrite');
            for (const r of remoteProposals) {
                const local = await tx.store.get(r.id);
                if (!local || r.updated_at > local.updatedAt) {
                    await tx.store.put({
                        id: r.id,
                        eventId: r.event_id,
                        title: r.title,
                        proposedDates: r.proposed_dates,
                        status: r.status,
                        isDeleted: r.is_deleted,
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
            .select()
            .gt('updated_at', lastSyncedAt);
        
        if (schedulesError) throw schedulesError;

        if (remoteSchedules && remoteSchedules.length > 0) {
            const tx = db.transaction('daily_schedules', 'readwrite');
            for (const r of remoteSchedules) {
                const local = await tx.store.get(r.id);
                if (!local || r.updated_at > local.updatedAt) {
                    await tx.store.put({
                        id: r.id,
                        date: r.date,
                        userId: r.user_id,
                        content: r.content,
                        isDeleted: r.is_deleted,
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
            .select()
            .gt('updated_at', lastSyncedAt);
        
        if (dateInfosError) throw dateInfosError;

        if (remoteDateInfos && remoteDateInfos.length > 0) {
            const tx = db.transaction('date_infos', 'readwrite');
            for (const r of remoteDateInfos) {
                const local = await tx.store.get(r.id);
                if (!local || r.updated_at > local.updatedAt) {
                    await tx.store.put({
                        id: r.id,
                        date: r.date,
                        isDate: r.is_date,
                        timeText: r.time_text,
                        isDeleted: r.is_deleted,
                        createdAt: r.created_at,
                        updatedAt: r.updated_at
                    });
                }
            }
            await tx.done;
        }

        await db.put('metadata', now, 'lastSyncedAt');
    } catch (e) {
        console.error('Failed to sync from Supabase', e);
    }
}

export function subscribeToSupabase(onUpdate: () => void) {
    const eventsChannel = supabase.channel('public:couple_events')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'couple_events' }, () => {
            syncFromSupabase().then(onUpdate);
        })
        .subscribe();

    const proposalsChannel = supabase.channel('public:date_proposals')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'date_proposals' }, () => {
            syncFromSupabase().then(onUpdate);
        })
        .subscribe();

    const schedulesChannel = supabase.channel('public:daily_schedules')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_schedules' }, () => {
            syncFromSupabase().then(onUpdate);
        })
        .subscribe();

    const dateInfosChannel = supabase.channel('public:date_infos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'date_infos' }, () => {
            syncFromSupabase().then(onUpdate);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(eventsChannel);
        supabase.removeChannel(proposalsChannel);
        supabase.removeChannel(schedulesChannel);
        supabase.removeChannel(dateInfosChannel);
    };
}
