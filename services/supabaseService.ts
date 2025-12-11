import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserTier, UserProfile } from '../types';

// Safe initialization
// Using process.env instead of import.meta.env to fix runtime error
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("Supabase credentials missing. App will run in Guest/Demo mode only.");
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
    // Fallback for demo without DB
    return {
      id: user.id,
      email: user.email || '',
      tier: UserTier.FREE,
      generationsUsed: 0,
      lastGenerationDate: null
    };
  }

  // In a real app, we would fetch this from a 'profiles' table
  // For MVP/Vibe Coding, we simulate based on Auth metadata or return default
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) {
     // Return default free profile if not found
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

// Limit Logic
export const checkUsageLimit = (profile: UserProfile | null, guestUsageCount: number): boolean => {
  if (!profile) {
    // Guest: 1 demo
    return guestUsageCount < 1;
  }

  // Free: 1 per week (Simulated by generic count for MVP)
  if (profile.tier === UserTier.FREE) {
     return profile.generationsUsed < 1; 
  }
  
  // Premium simulation
  if (profile.tier === UserTier.STORYTELLER) return profile.generationsUsed < 30; // ~1/day
  if (profile.tier === UserTier.WIZARD) return profile.generationsUsed < 90; // ~3/day

  return false;
};