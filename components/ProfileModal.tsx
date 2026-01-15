
import React, { useState } from 'react';
import { UserProfile, GeneratedStory, UserTier } from '../types';
import { GlassCard, Button, Input } from './UIComponents';
import { updateProfileName } from '../services/supabaseService';
import { TIERS, SCENARIO_OPTIONS } from '../constants';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  stories: GeneratedStory[];
  onUpdateProfile: (name: string) => void;
  onSelectStory: (story: GeneratedStory) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, user, stories, onUpdateProfile, onSelectStory }) => {
  const [name, setName] = useState(user.displayName);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSaveName = async () => {
    setIsSaving(true);
    try {
      await updateProfileName(user.id, name);
      onUpdateProfile(name);
      setIsEditing(false);
    } catch (e) {
      alert("Не удалось сохранить имя");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      <GlassCard className="relative z-[70] w-full max-w-2xl h-[90vh] bg-[#0f172a]/95 flex flex-col overflow-hidden border-white/10">
        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-indigo-200">
            Мой профиль
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {/* User Info Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <label className="text-xs uppercase tracking-wider text-indigo-300 font-bold">Имя пользователя</label>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <input 
                      className="bg-indigo-950/30 border border-indigo-500/50 rounded-lg px-3 py-1 text-white w-full focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                    />
                    <Button onClick={handleSaveName} disabled={isSaving} className="px-3 py-1 text-xs">
                      {isSaving ? '...' : 'OK'}
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-lg font-medium">{user.displayName}</span>
                    <button onClick={() => setIsEditing(true)} className="text-indigo-400 hover:text-indigo-300">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col justify-center">
              <label className="text-xs uppercase tracking-wider text-indigo-300 font-bold">Уровень тарифа</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded bg-indigo-500 text-white text-[10px] font-bold uppercase">
                  {TIERS[user.tier].label}
                </span>
                <span className="text-xs text-white/60">
                  {user.generationsUsed} / {TIERS[user.tier].limit} сказок
                </span>
              </div>
            </div>
          </div>

          {/* Stories List Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-indigo-100 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Моя библиотека
            </h3>
            
            {stories.length === 0 ? (
              <div className="text-center py-10 text-white/40 bg-white/5 rounded-2xl border border-dashed border-white/10">
                У вас пока нет сохраненных сказок
              </div>
            ) : (
              <div className="grid gap-3">
                {stories.map((story) => {
                  const scenario = SCENARIO_OPTIONS.find(s => s.value === story.params.scenario);
                  return (
                    <div 
                      key={story.id || story.timestamp}
                      onClick={() => onSelectStory(story)}
                      className="group flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center text-2xl">
                        {scenario?.icon || '✨'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-white truncate group-hover:text-indigo-200">{story.title}</h4>
                        <div className="flex gap-3 text-[10px] text-indigo-300/70 font-medium uppercase tracking-tighter">
                          <span>{new Date(story.timestamp).toLocaleDateString()}</span>
                          {story.audio_data && <span className="text-pink-400">● Аудио готово</span>}
                        </div>
                      </div>
                      <div className="text-white/20 group-hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 text-center text-[10px] text-white/30 italic">
          Сказки хранятся 30 дней после создания
        </div>
      </GlassCard>
    </div>
  );
};

export default ProfileModal;
