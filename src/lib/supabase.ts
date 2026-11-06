import type { Database } from './database.types';
import { createClient } from '@supabase/supabase-js';
import { isPublicSupabaseKey } from './public-config';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isConfigured = Boolean(url && key && isPublicSupabaseKey(key));
export const supabase = isConfigured
  ? createClient<Database>(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

export function client() {
  if (!supabase) throw new Error('Не настроено подключение. Выполните инструкцию из README.');
  return supabase;
}
