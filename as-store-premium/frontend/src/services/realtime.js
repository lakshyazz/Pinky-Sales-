/**
 * Supabase Realtime Service for Pinky Sales
 * Listens for live database changes (sales, payments, stock, customers)
 * and triggers instant multi-counter UI updates without manual page refreshes.
 */

export const SUPABASE_URL = 'https://mkaiwdqcvpltydmqsfer.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rYWl3ZHFjdnBsdHlkbXFzZmVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2Njg2NTgsImV4cCI6MjA5NjI0NDY1OH0.rNotqvt38sJ4wclgGPT9hj89N1EN68PNTv1yxev32c8';

let supabaseClient = null;

export async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  // 1. Try global window.supabase (loaded from CDN script)
  if (typeof window !== 'undefined' && window.supabase?.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return supabaseClient;
  }

  // 2. Fallback: dynamic ESM import if window.supabase is not yet loaded
  try {
    const { createClient } = await import(/* @vite-ignore */ 'https://esm.sh/@supabase/supabase-js@2');
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return supabaseClient;
  } catch (err) {
    console.warn('[Realtime] Unable to initialize Supabase client:', err);
    return null;
  }
}

/**
 * Subscribes to Postgres database changes for Pinky Sales
 * @param {Function} onDataChange - callback function invoked when a table changes (debounced)
 * @param {Function} onStatusChange - callback function invoked with connection status ('connected'|'disconnected'|'connecting')
 * @returns {Function} cleanup function to unsubscribe
 */
export function initRealtimeSubscription(onDataChange, onStatusChange) {
  let channel = null;
  let debounceTimer = null;
  let active = true;

  const tablesToListen = [
    'sales',
    'payments',
    'payment_allocations',
    'stock',
    'inventory_batches',
    'customers',
    'credit_notes',
    'products',
  ];

  async function setup() {
    if (onStatusChange) onStatusChange('connecting');
    const client = await getSupabaseClient();
    if (!client || !active) return;

    try {
      channel = client.channel('pinky-sales-realtime-channel');

      // Listen for all database changes across public schema
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          if (!active) return;
          const table = payload.table;

          // Only trigger for Pinky Sales business tables
          if (!tablesToListen.includes(table)) return;

          console.log(`[Realtime Sync] ⚡ Change detected on '${table}' (${payload.eventType}):`, payload);

          // Debounce 350ms to bundle multi-row transactions into a single refresh
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (active && onDataChange) {
              onDataChange({
                table,
                eventType: payload.eventType,
                newRecord: payload.new,
                oldRecord: payload.old,
              });
            }
          }, 350);
        }
      );

      channel.subscribe((status) => {
        if (!active) return;
        console.log('[Realtime Sync] Status:', status);
        if (onStatusChange) {
          if (status === 'SUBSCRIBED') {
            onStatusChange('connected');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            onStatusChange('disconnected');
          } else {
            onStatusChange('connecting');
          }
        }
      });
    } catch (err) {
      console.warn('[Realtime Sync] Setup error:', err);
      if (onStatusChange) onStatusChange('disconnected');
    }
  }

  setup();

  return () => {
    active = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (channel) {
      channel.unsubscribe();
    }
  };
}
