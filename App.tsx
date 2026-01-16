
import React, { useState, useEffect, useRef } from 'react';
import { 
  AppState, 
  Scenarios, 
  StoryRequest, 
  GeneratedStory, 
  UserProfile, 
  UserTier,
  VoiceOption
} from './types';
import { SCENARIO_OPTIONS, TIERS, VOICE_OPTIONS } from './constants';
import { generateStoryStream, generateStoryAudio } from './services/geminiService';
import { checkUsageLimit, getSupabase, getUserProfile, signOut, saveStory, getStories, updateStoryAudio } from './services/supabaseService';
import { Button, GlassCard, Input, ScenarioSelector, Spinner, Toggle, VoiceSelector } from './components/UIComponents';
import StoryModal from './components/StoryModal';
import AuthModal from './components/AuthModal';
import ProfileModal from './components/ProfileModal';

function App() {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [childName, setChildName] = useState('');
  const [scenario, setScenario] = useState<string>(Scenarios.SPACE);
  const [customHero, setCustomHero] = useState('');
  const [customPlace, setCustomPlace] = useState('');
  const [customEvent, setCustomEvent] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string>(VoiceOption.KORE);
  const [isInteractive, setIsInteractive] = useState(false);
  const [currentStory, setCurrentStory] = useState<GeneratedStory | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('auth_user_profile');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [storyHistory, setStoryHistory] = useState<GeneratedStory[]>(() => {
    try {
      const saved = localStorage.getItem('story_history_cache');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [guestUsage, setGuestUsage] = useState(() => {
    const saved = localStorage.getItem('guest_usage');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isAuthInit, setIsAuthInit] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const hasLoadedHistory = useRef(false);

  useEffect(() => {
    if (user) localStorage.setItem('auth_user_profile', JSON.stringify(user));
    else localStorage.removeItem('auth_user_profile');
  }, [user]);

  useEffect(() => {
    localStorage.setItem('story_history_cache', JSON.stringify(storyHistory));
  }, [storyHistory]);

  useEffect(() => {
    const supabase = getSupabase();
    if (supabase) {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session?.user) {
          const profile = await getUserProfile(session.user);
          setUser(profile);
          await loadAndCacheStories(profile.id);
        }
        setIsAuthInit(false);
      });
      
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          const profile = await getUserProfile(session.user);
          setUser(profile);
          await loadAndCacheStories(profile.id);
        } else if (event === 'SIGNED_OUT') {
          handleLogoutCleanup();
        }
        setIsAuthInit(false);
      });
      return () => subscription.unsubscribe();
    } else {
      setIsAuthInit(false);
    }
  }, []);

  const loadAndCacheStories = async (userId: string) => {
    const dbStories = await getStories(userId);
    setStoryHistory(dbStories);
    hasLoadedHistory.current = true;
  };

  const handleLogoutCleanup = () => {
    setUser(null);
    setStoryHistory([]);
    setIsInteractive(false);
    setSelectedVoice(VoiceOption.KORE);
    localStorage.removeItem('auth_user_profile');
    localStorage.removeItem('story_history_cache');
    localStorage.removeItem('guest_usage');
    setGuestUsage(0);
  };

  const handleAuthSuccess = async (supabaseUser: any) => {
    setIsAuthInit(true);
    const profile = await getUserProfile(supabaseUser);
    setUser(profile);
    await loadAndCacheStories(profile.id);
    setIsAuthInit(false);
    setShowAuthModal(false);
  };

  const isPremiumUnlocked = () => user?.tier === UserTier.STORYTELLER || user?.tier === UserTier.WIZARD;
  const getRemainingGenerations = () => user ? Math.max(0, TIERS[user.tier].limit - user.generationsUsed) : Math.max(0, 1 - guestUsage);

  // Helper to update audio across all relevant state pieces
  const handleAudioGenerated = (audioData: string, timestamp: number, storyId?: string) => {
    setStoryHistory(prev => prev.map(s => 
      s.timestamp === timestamp ? { ...s, audio_data: audioData, id: storyId || s.id } : s
    ));
    
    setCurrentStory(prev => {
      if (prev && prev.timestamp === timestamp) {
        return { ...prev, audio_data: audioData, id: storyId || prev.id };
      }
      return prev;
    });

    if (user && storyId) {
      updateStoryAudio(storyId, audioData);
    }
  };

  const handleGenerate = async () => {
    if (!childName.trim()) { setErrorMsg("Пожалуйста, введите имя ребенка"); return; }
    if (!checkUsageLimit(user, guestUsage)) {
      if (!user) { setShowAuthModal(true); setErrorMsg("Лимит гостя исчерпан. Пожалуйста, войдите."); }
      else { setErrorMsg("Лимит генераций исчерпан. Возвращайтесь позже!"); }
      return;
    }

    setAppState(AppState.LOADING);
    setErrorMsg(null);
    setIsStreaming(true);

    const request: StoryRequest = {
      childName,
      scenario: scenario as Scenarios,
      customHero: scenario === Scenarios.CUSTOM ? customHero : undefined,
      customPlace: scenario === Scenarios.CUSTOM ? customPlace : undefined,
      customEvent: scenario === Scenarios.CUSTOM ? customEvent : undefined,
      voice: (isPremiumUnlocked() ? selectedVoice : VoiceOption.KORE) as VoiceOption,
      isInteractive: isPremiumUnlocked() ? isInteractive : false
    };

    try {
      let firstChunkReceived = false;
      const startTime = Date.now();

      await generateStoryStream(request, async ({ title, content, isComplete }) => {
        // Continuous update for smooth streaming
        const updatedStory: GeneratedStory = {
          title: title || "Сочиняем заголовок...",
          content: content || "Начинаем рассказ...",
          timestamp: startTime,
          params: request
        };
        
        setCurrentStory(updatedStory);

        if (!firstChunkReceived && (title || content)) {
          firstChunkReceived = true;
          setAppState(AppState.SUCCESS);
        }

        if (isComplete) {
          setIsStreaming(false);
          
          // Use the absolute final text for persistence and audio
          const finalStory: GeneratedStory = {
            ...updatedStory,
            title: title || updatedStory.title,
            content: content || updatedStory.content
          };

          // 1. Local history update
          setStoryHistory(prev => [finalStory, ...prev]);

          // 2. Background persistence
          let savedStoryId: string | undefined;
          if (user) {
            saveStory(user.id, finalStory).then(async (dbResponse) => {
              if (dbResponse) {
                savedStoryId = dbResponse.id;
                setStoryHistory(prev => prev.map(s => s.timestamp === startTime ? { ...s, id: savedStoryId } : s));
                getUserProfile({ id: user.id } as any).then(p => setUser(p));
              }
            });
          } else {
            const nextUsage = guestUsage + 1;
            setGuestUsage(nextUsage);
            localStorage.setItem('guest_usage', nextUsage.toString());
          }

          // 3. Background audio generation (only start if we have real content)
          if (finalStory.content && finalStory.content.length > 20) {
            generateStoryAudio(finalStory.content, finalStory.params.voice)
              .then(audioData => {
                if (audioData) {
                  handleAudioGenerated(audioData, startTime, savedStoryId);
                }
              })
              .catch(err => console.error("Background TTS failed:", err));
          }
        }
      });
    } catch (err: any) {
      setErrorMsg("Магия немного сбилась. Попробуйте еще раз!");
      setAppState(AppState.ERROR);
      setIsStreaming(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    handleLogoutCleanup();
  };

  return (
    <div className="relative min-h-screen font-sans text-white overflow-x-hidden selection:bg-purple-500/30">
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81]" />
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1.5s' }} />
      </div>

      <header className="relative z-10 p-6 flex flex-col md:flex-row gap-4 justify-between items-center backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-3xl">✨</span>
          <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-200 to-indigo-200">AI Сказки</h1>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] md:text-xs text-indigo-200">
             Осталось сказок: <span className="font-bold text-white">{getRemainingGenerations()}</span>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 flex-nowrap min-w-[120px] justify-end">
            {user ? (
              <>
                <button 
                  onClick={() => setShowProfileModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 transition-all text-sm font-semibold text-indigo-100 whitespace-nowrap"
                >
                  <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
                    {(user.displayName || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline">Мой профиль</span>
                </button>
                <Button variant="secondary" onClick={handleLogout} className="px-4 py-2 text-sm shadow-none whitespace-nowrap">Выйти</Button>
              </>
            ) : !isAuthInit ? (
              <Button variant="primary" onClick={() => setShowAuthModal(true)} className="px-4 py-2 text-sm shadow-none whitespace-nowrap">Войти</Button>
            ) : (
              <div className="w-8 h-8 border-2 border-white/10 border-t-indigo-400 rounded-full animate-spin"></div>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 py-8 md:py-12 max-w-4xl">
        <div className="flex flex-col gap-8">
          <div className="text-center space-y-2 mb-4 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Создай волшебство</h2>
            <p className="text-indigo-200 text-lg">Личную аудио-сказку с вашим ребенком в главной роли.</p>
          </div>

          <GlassCard className="animate-fade-in delay-100">
            <div className="space-y-8">
              <div className="max-w-md mx-auto">
                <Input label="Как зовут ребёнка?" placeholder="Например: Артём" value={childName} onChange={(e) => setChildName(e.target.value)} className="text-lg" />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-200 ml-1">Выберите приключение</label>
                <ScenarioSelector options={SCENARIO_OPTIONS} selected={scenario} onChange={setScenario} />
              </div>
              {scenario === Scenarios.CUSTOM && (
                <div className="grid md:grid-cols-3 gap-4 p-4 bg-white/5 rounded-xl border border-white/10 animate-fade-in">
                  <Input label="Кто герой?" placeholder="Храбрый котёнок" value={customHero} onChange={(e) => setCustomHero(e.target.value)} />
                  <Input label="Где?" placeholder="Облачный город" value={customPlace} onChange={(e) => setCustomPlace(e.target.value)} />
                  <Input label="Что случилось?" placeholder="Потерянная звезда" value={customEvent} onChange={(e) => setCustomEvent(e.target.value)} />
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-6 p-4 bg-indigo-900/10 rounded-xl border border-indigo-500/10">
                <VoiceSelector options={VOICE_OPTIONS} selected={selectedVoice} onChange={setSelectedVoice} disabled={!isPremiumUnlocked()} />
                <div className="flex flex-col justify-end">
                   <Toggle label="Интерактивная" checked={isInteractive} onChange={setIsInteractive} disabled={!isPremiumUnlocked()} />
                </div>
              </div>
              {errorMsg && <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-center text-red-100 animate-pulse">{errorMsg}</div>}
              <div className="flex justify-center pt-4">
                <Button onClick={handleGenerate} disabled={appState === AppState.LOADING || !childName} className="w-full md:w-auto min-w-[200px] text-lg py-4 shadow-xl shadow-purple-900/20">
                  {appState === AppState.LOADING && !isStreaming ? <Spinner /> : '✨ Сочинить сказку'}
                </Button>
              </div>
            </div>
          </GlassCard>

          {storyHistory.length > 0 && (
            <div className="mt-12 animate-fade-in delay-200">
              <h3 className="text-xl font-semibold mb-4 text-indigo-200 pl-2 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Моя библиотека
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {storyHistory.slice(0, 4).map((hist, idx) => (
                  <GlassCard key={hist.id || hist.timestamp || idx} className="hover:bg-white/15 transition-all cursor-pointer group hover:scale-[1.01]" onClick={() => { setCurrentStory(hist); setAppState(AppState.SUCCESS); setIsStreaming(false); }}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-2xl">{SCENARIO_OPTIONS.find(o => o.value === hist.params.scenario)?.icon || '✨'}</span>
                      <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">{new Date(hist.timestamp).toLocaleDateString()}</span>
                    </div>
                    <h4 className="font-bold text-lg mb-2 group-hover:text-purple-300 transition-colors line-clamp-1">{hist.title}</h4>
                    <p className="text-sm text-gray-400 line-clamp-2">{hist.content}</p>
                    <div className="mt-3 flex items-center justify-between">
                       {hist.audio_data ? (
                        <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
                           <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" /> Аудио готово
                        </div>
                       ) : (
                         <div className="flex items-center gap-1 text-[10px] text-pink-400/70 font-bold uppercase tracking-wider animate-pulse">
                           <div className="w-1.5 h-1.5 bg-pink-400 rounded-full" /> Магия голоса...
                         </div>
                       )}
                       <span className="text-[10px] text-indigo-200/50 group-hover:text-indigo-200 font-bold uppercase">Читать →</span>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <StoryModal 
        story={currentStory} 
        isOpen={appState === AppState.SUCCESS && !!currentStory} 
        onClose={() => setAppState(AppState.IDLE)}
        isStreaming={isStreaming}
        onAudioLoaded={(data) => currentStory && handleAudioGenerated(data, currentStory.timestamp, currentStory.id)}
        userTier={user?.tier}
        onNewStory={() => { setAppState(AppState.IDLE); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      />
      
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={handleAuthSuccess} />
      
      {user && (
        <ProfileModal 
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          user={user}
          stories={storyHistory}
          onUpdateProfile={(n) => setUser({ ...user, displayName: n })}
          onSelectStory={(s) => { setCurrentStory(s); setShowProfileModal(false); setAppState(AppState.SUCCESS); }}
        />
      )}
    </div>
  );
}

export default App;
