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
import { generateStoryAI } from './services/geminiService';
import { checkUsageLimit, getSupabase, getUserProfile, signOut } from './services/supabaseService';
import { Button, GlassCard, Input, ScenarioSelector, Spinner, Toggle, VoiceSelector } from './components/UIComponents';
import StoryModal from './components/StoryModal';
import AuthModal from './components/AuthModal';

function App() {
  // State
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [childName, setChildName] = useState('');
  const [scenario, setScenario] = useState<string>(Scenarios.SPACE);
  
  // Custom Scenario Fields
  const [customHero, setCustomHero] = useState('');
  const [customPlace, setCustomPlace] = useState('');
  const [customEvent, setCustomEvent] = useState('');

  // Premium Features
  const [selectedVoice, setSelectedVoice] = useState<string>(VoiceOption.KORE);
  const [isInteractive, setIsInteractive] = useState(false);

  // Data
  const [currentStory, setCurrentStory] = useState<GeneratedStory | null>(null);
  const [storyHistory, setStoryHistory] = useState<GeneratedStory[]>([]); // Last 2 dialogues storage
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User & Auth
  const [user, setUser] = useState<UserProfile | null>(null);
  const [guestUsage, setGuestUsage] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAuthInit, setIsAuthInit] = useState(true);
  
  // Timer State
  const [timeToNextUnlock, setTimeToNextUnlock] = useState<string | null>(null);

  // Load persistence (History & Guest usage)
  useEffect(() => {
    const savedHistory = localStorage.getItem('story_history');
    if (savedHistory) {
      setStoryHistory(JSON.parse(savedHistory));
    }

    const savedGuest = localStorage.getItem('guest_usage');
    if (savedGuest) {
      setGuestUsage(parseInt(savedGuest, 10));
    }

    // Supabase Auth Listener
    const supabase = getSupabase();
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          getUserProfile(session.user).then(setUser);
        }
        setIsAuthInit(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          getUserProfile(session.user).then(setUser);
        } else {
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      setIsAuthInit(false);
    }
  }, []);

  // Save history when updated
  useEffect(() => {
    localStorage.setItem('story_history', JSON.stringify(storyHistory));
  }, [storyHistory]);

  // Timer Logic
  useEffect(() => {
    if (!user || !user.lastGenerationDate) {
      setTimeToNextUnlock(null);
      return;
    }

    const calculateTime = () => {
      const remainingGenerations = getRemainingGenerations();
      if (remainingGenerations > 0) {
        setTimeToNextUnlock(null);
        return;
      }

      const lastGenTime = new Date(user.lastGenerationDate!).getTime();
      let cooldownMs = 0;

      if (user.tier === UserTier.FREE) {
        cooldownMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      } else if (user.tier === UserTier.STORYTELLER || user.tier === UserTier.WIZARD) {
        cooldownMs = 24 * 60 * 60 * 1000; // 1 day
      }

      const unlockTime = lastGenTime + cooldownMs;
      const now = Date.now();
      const diff = unlockTime - now;

      if (diff <= 0) {
        setTimeToNextUnlock(null);
        // In a real app, we would refresh the user profile here to reset limits
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      let timeString = '';
      if (days > 0) timeString += `${days}д `;
      timeString += `${hours}ч ${minutes}м`;
      
      setTimeToNextUnlock(timeString);
    };

    const interval = setInterval(calculateTime, 60000); // Update every minute
    calculateTime(); // Initial call

    return () => clearInterval(interval);
  }, [user, guestUsage]); // Recalculate if user stats change

  // Helper: Check if Premium features are unlocked
  const isPremiumUnlocked = () => {
    if (!user) return false;
    return user.tier === UserTier.STORYTELLER || user.tier === UserTier.WIZARD;
  };

  const handleGenerate = async () => {
    // 1. Validation
    if (!childName.trim()) {
      setErrorMsg("Пожалуйста, введите имя ребенка");
      return;
    }

    // 2. Limit Check
    const allowed = checkUsageLimit(user, guestUsage);
    if (!allowed) {
      if (!user) {
        setShowAuthModal(true);
        setErrorMsg("Лимит гостя исчерпан. Пожалуйста, войдите.");
      } else {
        setErrorMsg("Лимит генераций исчерпан. Возвращайтесь позже!");
      }
      return;
    }

    // 3. Execution
    setAppState(AppState.LOADING);
    setErrorMsg(null);

    const request: StoryRequest = {
      childName,
      scenario: scenario as Scenarios,
      customHero: scenario === Scenarios.CUSTOM ? customHero : undefined,
      customPlace: scenario === Scenarios.CUSTOM ? customPlace : undefined,
      customEvent: scenario === Scenarios.CUSTOM ? customEvent : undefined,
      // Premium Features (Only applied if user is premium)
      voice: (isPremiumUnlocked() ? selectedVoice : VoiceOption.KORE) as VoiceOption,
      isInteractive: isPremiumUnlocked() ? isInteractive : false
    };

    try {
      const generated = await generateStoryAI(request);
      
      const newStory: GeneratedStory = {
        ...generated,
        timestamp: Date.now(),
        params: request
      };

      setCurrentStory(newStory);
      
      // Update history (Keep last 2)
      setStoryHistory(prev => {
        const newHist = [newStory, ...prev];
        return newHist.slice(0, 2);
      });

      // Update Limits
      if (!user) {
        const newUsage = guestUsage + 1;
        setGuestUsage(newUsage);
        localStorage.setItem('guest_usage', newUsage.toString());
      } else {
        // In real app, update DB here (Increment generationsUsed)
        // For MVP SPA, we update local state
        setUser(prev => prev ? ({
          ...prev, 
          generationsUsed: prev.generationsUsed + 1,
          lastGenerationDate: new Date().toISOString() // Set date for timer
        }) : null);
      }

      setAppState(AppState.SUCCESS);

    } catch (err: any) {
      console.error(err);
      setErrorMsg("Магия немного сбилась. Попробуйте еще раз!");
      setAppState(AppState.ERROR);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    // Reset premium settings on logout
    setIsInteractive(false);
    setSelectedVoice(VoiceOption.KORE);
  };

  // Helper to calculate remaining generations
  const getRemainingGenerations = () => {
    if (!user) {
      return Math.max(0, 1 - guestUsage);
    }
    const limit = TIERS[user.tier].limit;
    return Math.max(0, limit - user.generationsUsed);
  };

  const renderBackground = () => (
    <div className="fixed inset-0 z-0">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81]" />
      {/* Decorative Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] animate-pulse-slow" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1.5s' }} />
    </div>
  );

  return (
    <div className="relative min-h-screen font-sans text-white overflow-x-hidden selection:bg-purple-500/30">
      {renderBackground()}

      {/* Header */}
      <header className="relative z-10 p-6 flex flex-col md:flex-row gap-4 justify-between items-center backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-3xl">✨</span>
          <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-200 to-indigo-200">
            AI Сказки
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs md:text-sm text-indigo-200">
             {timeToNextUnlock ? (
               <span>Новая сказка через: <span className="font-bold text-pink-300">{timeToNextUnlock}</span></span>
             ) : (
               <span>Осталось сказок: <span className="font-bold text-white">{getRemainingGenerations()}</span></span>
             )}
          </div>

          {!isAuthInit && (
            user ? (
              <div className="flex items-center gap-4">
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium text-indigo-200">{user.email}</p>
                  <p className="text-xs text-white/50">{TIERS[user.tier].label}</p>
                </div>
                <Button variant="secondary" onClick={handleLogout} className="px-4 py-2 text-sm">
                  Выйти
                </Button>
              </div>
            ) : (
              <Button variant="primary" onClick={() => setShowAuthModal(true)} className="px-4 py-2 text-sm shadow-none">
                Войти
              </Button>
            )
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-4 py-8 md:py-12 max-w-4xl">
        
        {/* Main Form */}
        <div className="flex flex-col gap-8">
          
          <div className="text-center space-y-2 mb-4 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Создай волшебство
            </h2>
            <p className="text-indigo-200 text-lg">
              Персонализированная сказка для вашего ребенка за пару секунд
            </p>
          </div>

          <GlassCard className="animate-fade-in delay-100">
            <div className="space-y-8">
              {/* Name Input */}
              <div className="max-w-md mx-auto">
                <Input 
                  label="Как зовут ребёнка?" 
                  placeholder="Например: Артём"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  className="text-lg"
                />
              </div>

              {/* Scenario Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-200 ml-1">Выберите приключение</label>
                <ScenarioSelector 
                  options={SCENARIO_OPTIONS} 
                  selected={scenario} 
                  onChange={setScenario} 
                />
              </div>

              {/* Custom Fields */}
              {scenario === Scenarios.CUSTOM && (
                <div className="grid md:grid-cols-3 gap-4 p-4 bg-white/5 rounded-xl border border-white/10 animate-fade-in">
                  <Input 
                    label="Главный герой (кто?)" 
                    placeholder="Храбрый котёнок"
                    value={customHero}
                    onChange={(e) => setCustomHero(e.target.value)}
                  />
                  <Input 
                    label="Место действия" 
                    placeholder="Облачный город"
                    value={customPlace}
                    onChange={(e) => setCustomPlace(e.target.value)}
                  />
                  <Input 
                    label="Событие" 
                    placeholder="Потерянная звезда"
                    value={customEvent}
                    onChange={(e) => setCustomEvent(e.target.value)}
                  />
                </div>
              )}

              {/* Premium Features: Voice & Interactive */}
              <div className="grid md:grid-cols-2 gap-6 p-4 bg-indigo-900/10 rounded-xl border border-indigo-500/10">
                <VoiceSelector 
                  options={VOICE_OPTIONS}
                  selected={selectedVoice}
                  onChange={setSelectedVoice}
                  disabled={!isPremiumUnlocked()}
                />
                
                <div className="flex flex-col justify-end">
                   <Toggle 
                     label="Интерактивная сказка (вопрос в конце)"
                     checked={isInteractive}
                     onChange={setIsInteractive}
                     disabled={!isPremiumUnlocked()}
                   />
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-center text-red-100 animate-pulse">
                  {errorMsg}
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-center pt-4">
                <Button 
                  onClick={handleGenerate}
                  disabled={appState === AppState.LOADING || !childName}
                  className="w-full md:w-auto min-w-[200px] text-lg py-4 shadow-xl shadow-purple-900/20"
                >
                  {appState === AppState.LOADING ? <Spinner /> : '✨ Сочинить сказку'}
                </Button>
              </div>
            </div>
          </GlassCard>

          {/* History / Last 2 Dialogues */}
          {storyHistory.length > 0 && (
            <div className="mt-12 animate-fade-in delay-200">
              <h3 className="text-xl font-semibold mb-4 text-indigo-200 pl-2">Последние истории</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {storyHistory.map((hist, idx) => (
                  <GlassCard key={idx} className="hover:bg-white/15 transition-colors cursor-pointer group" >
                     <div onClick={() => { setCurrentStory(hist); setAppState(AppState.SUCCESS); }}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-2xl">{SCENARIO_OPTIONS.find(o => o.value === hist.params.scenario)?.icon || '✨'}</span>
                          <span className="text-xs text-indigo-300">
                            {new Date(hist.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="font-bold text-lg mb-2 group-hover:text-purple-300 transition-colors">{hist.title}</h4>
                        <p className="text-sm text-gray-400 line-clamp-3">{hist.content}</p>
                     </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <StoryModal 
        story={currentStory} 
        isOpen={appState === AppState.SUCCESS && !!currentStory} 
        onClose={() => setAppState(AppState.IDLE)}
        onNewStory={() => {
           setAppState(AppState.IDLE);
           window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
           setErrorMsg(null);
        }}
      />

    </div>
  );
}

export default App;