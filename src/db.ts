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
    metadata: {
        key: string;
        value: any;
    };
}

let dbPromise: Promise<IDBPDatabase<CoupleSyncDB>> | null = null;

export function initDB() {
    if (!dbPromise) {
        dbPromise = openDB<CoupleSyncDB>('couple-sync', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('events')) {
                    const store = db.createObjectStore('events', { keyPath: 'id' });
                    store.createIndex('by-updated', 'updatedAt');
                }
                if (!db.objectStoreNames.contains('proposals')) {
                    const store = db.createObjectStore('proposals', { keyPath: 'id' });
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

    return () => {
        supabase.removeChannel(eventsChannel);
        supabase.removeChannel(proposalsChannel);
    };
}
