import React, { useState, useEffect, useRef } from 'react';
import { GeneratedStory } from '../types';
import { Button, GlassCard, Spinner } from './UIComponents';
import { generateStoryAudio } from '../services/geminiService';

interface StoryModalProps {
  story: GeneratedStory | null;
  isOpen: boolean;
  onClose: () => void;
  onNewStory: () => void;
}

// Helper to decode Base64
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to decode PCM Data
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const StoryModal: React.FC<StoryModalProps> = ({ story, isOpen, onClose, onNewStory }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0); // For basic pause/resume simulation (restart logic)

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopAudio();
    } else {
       // Reset state when opening new story
       audioBufferRef.current = null;
       pausedAtRef.current = 0;
    }
  }, [isOpen, story]);

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // ignore if already stopped
      }
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
    pausedAtRef.current = 0;
  };

  const handleToggleAudio = async () => {
    if (!story) return;

    // If currently playing, stop it
    if (isPlaying) {
      stopAudio();
      return;
    }

    setIsLoadingAudio(true);

    try {
      // Initialize Context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      } else if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // 1. Check if we already have the buffer (cached for this session)
      if (!audioBufferRef.current) {
        // 2. Fetch Audio from Gemini
        // Pass the voice selected in story params
        const voice = story.params.voice;
        const base64Audio = await generateStoryAudio(story.content, voice);
        
        // 3. Decode
        const byteArray = decode(base64Audio);
        const buffer = await decodeAudioData(byteArray, audioContextRef.current, 24000, 1);
        audioBufferRef.current = buffer;
      }

      // 4. Play
      playBuffer(audioBufferRef.current);

    } catch (error) {
      console.error("Audio playback failed:", error);
      alert("Не удалось озвучить сказку. Проверьте API ключ.");
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const playBuffer = (buffer: AudioBuffer) => {
    if (!audioContextRef.current) return;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      setIsPlaying(false);
    };

    source.start(0);
    audioSourceRef.current = source;
    setIsPlaying(true);
  };

  if (!isOpen || !story) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />
      
      {/* Content Wrapper */}
      <div className="relative z-50 w-full max-w-2xl h-[85vh] flex flex-col animate-fade-in">
        <GlassCard className="flex flex-col h-full bg-[#1a1b4b]/90 border-indigo-500/30 overflow-hidden">
          
          {/* Header */}
          <div className="flex-none flex justify-between items-start mb-6 border-b border-white/10 pb-4">
            <h2 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-pink-200 pr-4">
              {story.title}
            </h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white flex-shrink-0"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar space-y-4">
            <p className="text-lg leading-relaxed text-indigo-50 whitespace-pre-line font-light">
              {story.content}
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex-none mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3 justify-between items-center">
             
             {/* Audio Player Controls */}
             <div className="flex items-center gap-2 w-full sm:w-auto bg-white/5 rounded-xl p-1 pr-3">
               <button
                 onClick={handleToggleAudio}
                 disabled={isLoadingAudio}
                 className="w-10 h-10 flex items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/40 hover:text-white transition-all disabled:opacity-50 disabled:cursor-wait"
                 title={isPlaying ? "Стоп" : "Озвучить (Gemini)"}
               >
                 {isLoadingAudio ? (
                   <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                 ) : isPlaying ? (
                   <div className="w-3 h-3 bg-indigo-200 rounded-sm"></div> // Stop Icon
                 ) : (
                   <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                   </svg>
                 )}
               </button>
               
               <span className="text-xs font-medium text-indigo-200 hidden sm:inline">
                 {isLoadingAudio ? 'Генерация...' : (isPlaying ? 'Играет сказка' : 'Озвучить')}
               </span>
             </div>

            <div className="flex gap-3 w-full sm:w-auto">
              <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-none justify-center">
                Закрыть
              </Button>
              <Button onClick={onNewStory} className="flex-1 sm:flex-none justify-center">
                ✨ Новая
              </Button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default StoryModal;