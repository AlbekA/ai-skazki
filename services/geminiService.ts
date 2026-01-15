
import { GoogleGenAI, Modality } from "@google/genai";
import { StoryRequest, Scenarios } from "../types";
import { GEMINI_MODEL_NAME, SYSTEM_INSTRUCTION } from "../constants";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing in process.env");
  }
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

/**
 * Generates a story using streaming for better UX.
 * @param onChunk Callback for partial updates { title?: string, content?: string }
 */
export const generateStoryStream = async (
  request: StoryRequest,
  onChunk: (data: { title?: string; content?: string; isComplete: boolean }) => void
): Promise<void> => {
  const ai = getAiClient();
  
  let promptDetails = `Напиши сказку для ребенка по имени ${request.childName}.`;
  
  if (request.scenario === Scenarios.CUSTOM) {
    promptDetails += `
    Сценарий: Свой собственный.
    Главный герой: ${request.customHero || 'Ребенок'};
    Место действия: ${request.customPlace || 'Волшебная страна'};
    Главное событие: ${request.customEvent || 'Неожиданное приключение'}.
    `;
  } else {
    promptDetails += ` Сценарий: ${request.scenario}.`;
  }

  if (request.isInteractive) {
    promptDetails += " ЭТО ИНТЕРАКТИВНАЯ СКАЗКА. В конце герой должен предложить ребенку выбор.";
  } else {
    promptDetails += " Сказка должна быть законченной и доброй.";
  }

  try {
    const responseStream = await ai.models.generateContentStream({
      model: GEMINI_MODEL_NAME,
      contents: promptDetails,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.8,
      }
    });

    let fullText = "";
    let title = "";
    let content = "";

    for await (const chunk of responseStream) {
      const chunkText = chunk.text;
      if (!chunkText) continue;

      fullText += chunkText;

      // Simple streaming parser for the format:
      // ЗАГОЛОВОК: ...
      // СЮЖЕТ: ...
      const titleMatch = fullText.match(/ЗАГОЛОВОК:\s*(.*?)(?:\n|СЮЖЕТ:|$)/s);
      const contentMatch = fullText.match(/СЮЖЕТ:\s*(.*)/s);

      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }
      
      if (contentMatch && contentMatch[1]) {
        content = contentMatch[1].trim();
      } else if (!contentMatch && titleMatch && fullText.includes('СЮЖЕТ:')) {
        // Handle case where СЮЖЕТ: marker is present but text hasn't started yet
        content = "";
      }

      onChunk({ 
        title: title || "Волшебная история...", 
        content: content, 
        isComplete: false 
      });
    }

    onChunk({ title, content, isComplete: true });

  } catch (error) {
    console.error("Gemini Streaming Error:", error);
    throw error;
  }
};

/**
 * Generates audio for the story using Gemini TTS.
 */
export const generateStoryAudio = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
  const ai = getAiClient();
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio data received from Gemini");
    }

    return base64Audio;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
};
