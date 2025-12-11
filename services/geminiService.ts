import { GoogleGenAI, Type } from "@google/genai";
import { StoryRequest, Scenarios, GeneratedStory } from "../types";
import { GEMINI_MODEL_NAME, SYSTEM_INSTRUCTION } from "../constants";

// Initialize Gemini Client
const getAiClient = () => {
  // Use process.env.API_KEY as per guidelines
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing in process.env");
  }
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

/**
 * Generates a story with 1 automatic retry on failure.
 */
export const generateStoryAI = async (
  request: StoryRequest, 
  retryCount = 0
): Promise<Omit<GeneratedStory, 'timestamp' | 'params'>> => {
  const ai = getAiClient();
  
  // Construct the Prompt
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
    promptDetails += " ЭТО ИНТЕРАКТИВНАЯ СКАЗКА. Сказка должна быть построена так, что в конце главный герой обращается к читателю (ребенку) с вопросом, как поступить дальше, или предлагает выбор действия.";
  } else {
    promptDetails += " Сказка должна быть законченной, доброй и учить дружбе.";
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_NAME,
      contents: promptDetails,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.9,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "Заголовок сказки"
            },
            content: {
              type: Type.STRING,
              description: "Полный текст сказки (600-700 слов)"
            }
          },
          required: ["title", "content"]
        }
      }
    });

    if (!response.text) {
      throw new Error("Empty response from Gemini");
    }

    // Sanitize JSON (remove markdown code blocks if present)
    let cleanText = response.text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    let json;
    try {
      json = JSON.parse(cleanText);
    } catch (e) {
      console.error("Failed to parse JSON:", cleanText);
      throw new Error("Invalid JSON format received from AI");
    }
    
    // Basic validation
    if (!json.title || !json.content) {
      throw new Error("Invalid JSON structure: missing title or content");
    }

    return {
      title: json.title,
      content: json.content
    };

  } catch (error) {
    console.error(`Gemini API Error (Attempt ${retryCount + 1}):`, error);
    
    // T2 Requirement: 1 retry on error
    if (retryCount < 1) {
      console.log("Retrying generation...");
      return generateStoryAI(request, retryCount + 1);
    }
    
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
        responseModalities: ['AUDIO'],
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