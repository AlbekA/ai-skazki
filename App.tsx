
import React, { useState, useEffect } from 'react';
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
import { checkUsageLimit, getSupabase, getUserProfile, signOut, saveStory, getStories } from './services/supabaseService';
import { Button, GlassCard, Input, ScenarioSelector, Spinner, Toggle, VoiceSelector } from './components/UIComponents';
import StoryModal from './components/StoryModal';
import AuthModal from './components/AuthModal';

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
  const [storyHistory, setStoryHistory] = useState<GeneratedStory[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [guestUsage, setGuestUsage] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAuthInit, setIsAuthInit] = useState(true);
  const [timeToNextUnlock, setTimeToNextUnlock] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const savedGuest = localStorage.getItem('guest_usage');
    if (savedGuest) setGuestUsage(parseInt(savedGuest, 10));

    const supabase = getSupabase();
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          getUserProfile(session.user).then(profile => {
            setUser(profile);
            loadUserStories(profile.id);
          });
        } else {
          loadLocalHistory();
        }
        setIsAuthInit(false);
      });
      
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          getUserProfile(session.user).then(profile => {
            setUser(profile);
            loadUserStories(profile.id);
          });
        } else {
          setUser(null);
          loadLocalHistory();
        }
      });
      return () => subscription.unsubscribe();
    } else {
      loadLocalHistory();
      setIsAuthInit(false);
    }
  }, []);

  const loadLocalHistory = () => {
    const savedHistory = localStorage.getItem('story_history');
    if (savedHistory) setStoryHistory(JSON.parse(savedHistory));
  };

  const loadUserStories = async (userId: string) => {
    const dbStories = await getStories(userId);
    setStoryHistory(dbStories);
  };

  useEffect(() => {
    if (!user) {
      localStorage.setItem('story_history', JSON.stringify(storyHistory.slice(0, 2)));
    }
  }, [storyHistory, user]);

  useEffect(() => {
    if (!user || !user.lastGenerationDate) {
      setTimeToNextUnlock(null);
      return;
    }
    const calculateTime = () => {
      if (getRemainingGenerations() > 0) {
        setTimeToNextUnlock(null);
        return;
      }
      const lastGenTime = new Date(user.lastGenerationDate!).getTime();
      let cooldownMs = user.tier === UserTier.FREE ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const diff = lastGenTime + cooldownMs - Date.now();
      if (diff <= 0) { setTimeToNextUnlock(null); return; }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeToNextUnlock(`${days > 0 ? days + 'д ' : ''}${hours}ч ${minutes}м`);
    };
    const interval = setInterval(calculateTime, 60000);
    calculateTime();
    return () => clearInterval(interval);
  }, [user, guestUsage]);

  const isPremiumUnlocked = () => user?.tier === UserTier.STORYTELLER || user?.tier === UserTier.WIZARD;

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
      let finalStory: GeneratedStory | null = null;

      await generateStoryStream(request, async ({ title, content, isComplete }) => {
        const newStory: GeneratedStory = {
          title: title || "Сочиняем заголовок...",
          content: content || "Начинаем рассказ...",
          timestamp: Date.now(),
          params: request
        };
        
        setCurrentStory(newStory);

        if (!firstChunkReceived && (title || content)) {
          firstChunkReceived = true;
          setAppState(AppState.SUCCESS);
        }

        if (isComplete) {
          setIsStreaming(false);
          finalStory = newStory;
          
          if (user) {
            // Registered users: generate and save audio as well
            const audioData = await generateStoryAudio(newStory.content, newStory.params.voice);
            const savedDbStory = await saveStory(user.id, newStory, audioData);
            
            if (savedDbStory) {
              const storyWithId = { ...newStory, id: savedDbStory.id, audio_data: audioData };
              setCurrentStory(storyWithId);
              setStoryHistory(prev => [storyWithId, ...prev]);
            }
            
            // Refresh profile state
            const updatedProfile = await getUserProfile({ id: user.id } as any);
            setUser(updatedProfile);
          } else {
            // Guest: only local history
            setStoryHistory(prev => [newStory, ...prev].slice(0, 2));
            const newUsage = guestUsage + 1;
            setGuestUsage(newUsage);
            localStorage.setItem('guest_usage', newUsage.toString());
          }
        }
      });
    } catch (err: any) {
      setErrorMsg("Магия немного сбилась. Попробуйте еще раз!");
      setAppState(AppState.ERROR);
      setIsStreaming(false);
    }
  };

  const getRemainingGenerations = () => user ? Math.max(0, TIERS[user.tier].limit - user.generationsUsed) : Math.max(0, 1 - guestUsage);

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    setIsInteractive(false);
    setSelectedVoice(VoiceOption.KORE);
    loadLocalHistory();
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
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs md:text-sm text-indigo-200">
             {timeToNextUnlock ? (<span>Новая через: <span className="font-bold text-pink-300">{timeToNextUnlock}</span></span>) : (<span>Осталось сказок: <span className="font-bold text-white">{getRemainingGenerations()}</span></span>)}
          </div>
          {!isAuthInit && (user ? (
            <div className="flex items-center gap-4">
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-indigo-200">{user.email}</p>
                <p className="text-xs text-white/50">{TIERS[user.tier].label}</p>
              </div>
              <Button variant="secondary" onClick={handleLogout} className="px-4 py-2 text-sm">Выйти</Button>
            </div>
          ) : (<Button variant="primary" onClick={() => setShowAuthModal(true)} className="px-4 py-2 text-sm shadow-none">Войти</Button>))}
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 py-8 md:py-12 max-w-4xl">
        <div className="flex flex-col gap-8">
          <div className="text-center space-y-2 mb-4 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Создай волшебство</h2>
            <p className="text-indigo-200 text-lg">Сказка сохранится в профиле на 30 дней!</p>
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
              <h3 className="text-xl font-semibold mb-4 text-indigo-200 pl-2">Моя библиотека</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {storyHistory.map((hist, idx) => (
                  <GlassCard key={hist.id || idx} className="hover:bg-white/15 transition-colors cursor-pointer group" onClick={() => { setCurrentStory(hist); setAppState(AppState.SUCCESS); setIsStreaming(false); }}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-2xl">{SCENARIO_OPTIONS.find(o => o.value === hist.params.scenario)?.icon || '✨'}</span>
                      <span className="text-xs text-indigo-300">{new Date(hist.timestamp).toLocaleDateString()}</span>
                    </div>
                    <h4 className="font-bold text-lg mb-2 group-hover:text-purple-300 transition-colors">{hist.title}</h4>
                    <p className="text-sm text-gray-400 line-clamp-3">{hist.content}</p>
                    {hist.audio_data && (
                      <div className="mt-3 flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
                         <div className="w-1 h-1 bg-indigo-400 rounded-full animate-pulse" /> Аудио сохранено
                      </div>
                    )}
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
        userTier={user?.tier}
        onNewStory={() => { setAppState(AppState.IDLE); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={() => setErrorMsg(null)} />
    </div>
  );
}

export default App;
