// Enums
export enum Scenarios {
  SPACE = 'Космос 🚀',
  FOREST = 'Волшебный лес 🌲',
  UNDERWATER = 'Подводное царство 🌊',
  CASTLE = 'Замок принцессы/рыцаря 🏰',
  DINOSAURS = 'Мир динозавров 🦕',
  CUSTOM = '✨ Своя сказка'
}

export enum AppState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export enum UserTier {
  GUEST = 'guest',
  FREE = 'free',
  STORYTELLER = 'storyteller',
  WIZARD = 'wizard'
}

export enum VoiceOption {
  KORE = 'Kore',   // Female, Soothing
  PUCK = 'Puck',   // Male, Playful
  FENRIR = 'Fenrir', // Deep, Epic
  AOEDE = 'Aoede' // High, Energetic
}

// Interfaces
export interface StoryRequest {
  childName: string;
  scenario: Scenarios;
  customHero?: string;
  customPlace?: string;
  customEvent?: string;
  // New features
  voice: VoiceOption;
  isInteractive: boolean;
}

export interface GeneratedStory {
  title: string;
  content: string;
  timestamp: number;
  params: StoryRequest;
}

export interface UserProfile {
  id: string;
  email: string;
  tier: UserTier;
  generationsUsed: number;
  lastGenerationDate: string | null;
}

export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Supabase Database Types (simplified)
export interface DBStory {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
}