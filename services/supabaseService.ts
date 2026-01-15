
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserTier, UserProfile, GeneratedStory } from '../types';
import { TIERS } from '../constants';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("Supabase credentials missing. App will run in Guest/Demo mode only.");
}

export const getSupabase = () => supabase;

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

/**
 * Saves a story to Supabase with 30-day expiration
 */
export const saveStory = async (userId: string, story: GeneratedStory, audioData?: string) => {
  if (!supabase) return null;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const { data, error } = await supabase
    .from('stories')
    .insert({
      user_id: userId,
      title: story.title,
      content: story.content,
      audio_data: audioData,
      params: story.params,
      expires_at: expiresAt.toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error("Error saving story:", error);
    return null;
  }

  // Update generation count in profile
  await supabase.rpc('increment_generations', { user_id: userId });

  return data;
};

/**
 * Fetches user stories, filtering out expired ones
 */
export const getStories = async (userId: string): Promise<GeneratedStory[]> => {
  if (!supabase) return [];

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', now)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching stories:", error);
    return [];
  }

  return data.map(item => ({
    id: item.id,
    title: item.title,
    content: item.content,
    audio_data: item.audio_data,
    timestamp: new Date(item.created_at).getTime(),
    params: item.params
  }));
};

export const checkUsageLimit = (profile: UserProfile | null, guestUsageCount: number): boolean => {
  if (!profile) return guestUsageCount < TIERS[UserTier.GUEST].limit;
  const tierLimit = TIERS[profile.tier]?.limit || 0;
  return profile.generationsUsed < tierLimit;
};
