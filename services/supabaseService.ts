import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserTier, UserProfile } from '../types';

// Robust initialization: Check both import.meta.env (Vite standard) and process.env (legacy/shim)
const getEnvVar = (key: string) => {
  // @ts-ignore
  return import.meta.env[key] || process.env[key] || process.env[key.replace('VITE_', '')];
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("Supabase credentials missing. App will run in Guest/Demo mode only. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const getSupabase = () => supabase;

// Auth Helpers
export const signInWithEmail = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase not configured");
  return await supabase.auth.signInWithPassword({ email, password });
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase not configured");
  return await supabase.auth.signUp({ email, password });
};

export const signOut = async () => {
  if (!supabase) return;
  return await supabase.auth.signOut();
};

export const getUserProfile = async (user: User): Promise<UserProfile> => {
  if (!supabase) {
    return {
      id: user.id,
      email: user.email || '',
      tier: UserTier.FREE,
      generationsUsed: 0,
      lastGenerationDate: null
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) {
     return {
        id: user.id,
        email: user.email || '',
        tier: UserTier.FREE,
        generationsUsed: 0,
        lastGenerationDate: null
     };
  }

  return data as UserProfile;
};

export const checkUsageLimit = (profile: UserProfile | null, guestUsageCount: number): boolean => {
  if (!profile) {
    return guestUsageCount < 1;
  }
  if (profile.tier === UserTier.FREE) {
     return profile.generationsUsed < 1; 
  }
  if (profile.tier === UserTier.STORYTELLER) return profile.generationsUsed < 30;
  if (profile.tier === UserTier.WIZARD) return profile.generationsUsed < 90;

  return false;
};