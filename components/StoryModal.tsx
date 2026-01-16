
import { GeneratedStory, UserTier } from '../types';
import { Button, GlassCard } from './UIComponents';
import { generateStoryAudio } from '../services/geminiService';
import React, { useState, useEffect, useRef } from 'react';

interface StoryModalProps {
  story: GeneratedStory | null;
  isOpen: boolean;
  onClose: () => void;
  onNewStory: () => void;
  onAudioLoaded?: (audioData: string) => void;
  isStreaming?: boolean;
  userTier?: UserTier;
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

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

const StoryModal: React.FC<StoryModalProps> = ({ 
  story, 
  isOpen, 
  onClose, 
  onNewStory, 
  onAudioLoaded,
  isStreaming = false, 
  userTier = UserTier.GUEST 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  const contentEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const lastProcessedStoryRef = useRef<number | null>(null);

  useEffect(() => {
    if (isStreaming && contentEndRef.current) {
      contentEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [story?.content, isStreaming]);

  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // When story changes, reset local audio state
  useEffect(() => {
    if (story?.timestamp !== lastProcessedStoryRef.current) {
      stopAudio();
      audioBufferRef.current = null;
      lastProcessedStoryRef.current = story?.timestamp || null;
    }
  }, [story?.timestamp]);

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const isAudioDisabled = () => {
    if (isStreaming || !story) return true;
    // Guest limit: can only listen to fresh stories (within 1 min of generation if no audio_data)
    if (userTier === UserTier.GUEST && !story.audio_data && !audioBufferRef.current) {
      const isHistory = (Date.now() - story.timestamp > 60000);
      if (isHistory) return true;
    }
    return false;
  };

  const handleToggleAudio = async () => {
    if (isAudioDisabled()) return;

    if (isPlaying) {
      stopAudio();
      return;
    }

    setIsLoadingAudio(true);

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      } else if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // 1. Check if we already have the decoded buffer
      if (audioBufferRef.current) {
        playBuffer(audioBufferRef.current);
        setIsLoadingAudio(false);
        return;
      }

      // 2. Check for base64 in story object
      let base64Audio = story?.audio_data;
      
      // 3. Generate if totally missing
      if (!base64Audio && story) {
        try {
          base64Audio = await generateStoryAudio(story.content, story.params.voice);
          if (onAudioLoaded && base64Audio) {
            onAudioLoaded(base64Audio);
          }
        } catch (err) {
          console.error("Manual TTS generation failed:", err);
        }
      }

      if (base64Audio) {
        const byteArray = decode(base64Audio);
        const buffer = await decodeAudioData(byteArray, audioContextRef.current, 24000, 1);
        audioBufferRef.current = buffer;
        playBuffer(buffer);
      } else {
        // Still nothing? Background generation might be working.
        // Wait a bit or show error.
      }

    } catch (error) {
      console.error("Audio playback error:", error);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleDownloadAudio = async () => {
    if (!story || userTier !== UserTier.WIZARD) return;
    
    setIsLoadingAudio(true);
    try {
      let base64Audio = story.audio_data;
      if (!base64Audio) {
        base64Audio = await generateStoryAudio(story.content, story.params.voice);
        if (onAudioLoaded && base64Audio) onAudioLoaded(base64Audio);
      }
      
      if (base64Audio) {
        const blob = new Blob([decode(base64Audio)], { type: 'audio/pcm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${story.title || 'audio'}.pcm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const playBuffer = (buffer: AudioBuffer) => {
    if (!audioContextRef.current) return;
    stopAudio();
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => setIsPlaying(false);
    source.start(0);
    audioSourceRef.current = source;
    setIsPlaying(true);
  };

  if (!isOpen || !story) return null;

  const isAudioReady = !!(story.audio_data || audioBufferRef.current);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in" onClick={isStreaming ? undefined : onClose} />
      
      <div className="relative z-50 w-full max-w-2xl h-[85vh] flex flex-col animate-fade-in">
        <GlassCard className="flex flex-col h-full bg-[#1a1b4b]/90 border-indigo-500/30 overflow-hidden">
          
          <div className="flex-none flex justify-between items-start mb-6 border-b border-white/10 pb-4">
            <h2 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-pink-200 pr-4">
              {story.title}
            </h2>
            {!isStreaming && (
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar space-y-4">
            <p className="text-lg leading-relaxed text-indigo-50 whitespace-pre-line font-light">
              {story.content}
              {isStreaming && <span className="inline-block w-2 h-5 ml-1 bg-purple-400 animate-pulse align-middle" />}
            </p>
            <div ref={contentEndRef} />
          </div>

          <div className="flex-none mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3 justify-between items-center">
             <div className="flex items-center gap-2 w-full sm:w-auto bg-white/5 rounded-xl p-1 pr-3">
               <button
                 onClick={handleToggleAudio}
                 disabled={isLoadingAudio || isAudioDisabled()}
                 className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed
                   ${isPlaying ? 'bg-indigo-500 text-white' : 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/40 hover:text-white'}
                 `}
               >
                 {isLoadingAudio ? (
                   <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                 ) : isPlaying ? (
                   <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                     <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                   </svg>
                 ) : (
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                   </svg>
                 )}
               </button>
               
               {userTier === UserTier.WIZARD && !isStreaming && isAudioReady && (
                 <button 
                  onClick={handleDownloadAudio}
                  className="w-10 h-10 flex items-center justify-center rounded-lg bg-purple-500/20 text-purple-200 hover:bg-purple-500/40 hover:text-white transition-all"
                  title="Скачать аудио"
                 >
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                   </svg>
                 </button>
               )}
               
               <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-indigo-300/70 tracking-wider">
                    {isStreaming ? 'Создаем...' : (isAudioDisabled() ? 'Недоступно' : (isPlaying ? 'Играет' : 'Сказка голосом'))}
                  </span>
                  {!isAudioReady && !isStreaming && !isAudioDisabled() && (
                    <span className="text-[9px] text-pink-400 animate-pulse font-bold uppercase leading-none">Голос готовится...</span>
                  )}
               </div>
             </div>

            <div className="flex gap-3 w-full sm:w-auto">
              <Button variant="secondary" onClick={onClose} disabled={isStreaming} className="flex-1 sm:flex-none">Закрыть</Button>
              <Button onClick={onNewStory} disabled={isStreaming} className="flex-1 sm:flex-none">✨ Новая</Button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default StoryModal;
