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
  [UserTier.FREE]: { limit: 1, label: 'Бесплатный' }, // Per week logic handled in service
  [UserTier.STORYTELLER]: { limit: 30, label: 'Сказочник' }, // 1 per day approx
  [UserTier.WIZARD]: { limit: 90, label: 'Волшебник' }, // 3 per day approx
};

export const GEMINI_MODEL_NAME = "gemini-2.5-flash";

export const SYSTEM_INSTRUCTION = `
Ты — профессиональный детский писатель. Твоя задача — писать добрые, поучительные и увлекательные сказки для детей.
Язык: Русский.
Длина: 600–700 слов.
Тон: Магический, уютный, безопасный.

Структура ответа должна быть СТРОГО в формате JSON.
Не используй markdown разметку внутри JSON значений.
`;