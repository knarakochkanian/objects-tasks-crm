import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import type { Profile } from '../../lib/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: unknown;
  retry: () => void;
}
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState<unknown>(null);
  const identity = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let active = true;
    let eventsReceived = 0;
    const apply = (next: Session | null) => {
      if (!active) return;
      if (identity.current !== (next?.user.id ?? null)) {
        void cache.cancelQueries();
        cache.clear();
        identity.current = next?.user.id ?? null;
      }
      setSession(next);
      setChecking(false);
      setSessionError(null);
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      eventsReceived += 1;
      apply(next);
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || eventsReceived) return;
        if (error) {
          setSessionError(error);
          setChecking(false);
        } else apply(data.session);
      })
      .catch((error) => {
        if (active) {
          setSessionError(error);
          setChecking(false);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [cache]);
  const profile = useQuery({
    queryKey: ['identity', session?.user.id],
    queryFn: ({ signal }) => api.profile(session!.user.id, signal),
    enabled: !!session,
    retry: 1,
  });
  const value: AuthState = {
    session,
    profile: profile.data ?? null,
    loading: checking || (!!session && profile.isPending),
    error: sessionError || profile.error,
    retry: () => {
      void profile.refetch();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error('AuthProvider is missing');
  return state;
}
