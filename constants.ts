
import { Scenarios, UserTier, VoiceOption } from "./types";

export const APP_NAME = "AI Сказки";

export const SCENARIO_OPTIONS = [
  { value: Scenarios.SPACE, label: 'Космос', icon: '🚀' },
  { value: Scenarios.FOREST, label: 'Лес', icon: '🌲' },
  { value: Scenarios.UNDERWATER, label: 'Океан', icon: '🌊' },
  { value: Scenarios.CASTLE, label: 'Замок', icon: '🏰' },
  { value: Scenarios.DINOSAURS, label: 'Динозавры', icon: '🦕' },
  { value: Scenarios.CUSTOM, label: 'Свой сюжет', icon: '✨' },
];

export const VOICE_OPTIONS = [
  { value: VoiceOption.KORE, label: 'Мария (Мягкий)', gender: 'female' },
  { value: VoiceOption.PUCK, label: 'Иван (Игривый)', gender: 'male' },
  { value: VoiceOption.FENRIR, label: 'Сказочник (Бас)', gender: 'male' },
];

export const TIERS = {
  [UserTier.GUEST]: { limit: 1, label: 'Гость' },
  [UserTier.FREE]: { limit: 1, label: 'Бесплатный' },
  [UserTier.STORYTELLER]: { limit: 30, label: 'Сказочник' },
  [UserTier.WIZARD]: { limit: 90, label: 'Волшебник' },
};

// Use the latest high-performance model
export const GEMINI_MODEL_NAME = "gemini-3-flash-preview";

export const SYSTEM_INSTRUCTION = `
Ты — профессиональный детский писатель. Твоя задача — писать добрые, поучительные и увлекательные сказки для детей.
Язык: Русский.
Целевая длина: 600–700 слов.
Тон: Магический, уютный, безопасный.

ВАЖНО: Выводи ответ СТРОГО в следующем формате для возможности потоковой обработки:
ЗАГОЛОВОК: [Тут название сказки]
СЮЖЕТ: [Тут основной текст сказки]
`;
