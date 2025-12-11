import { GoogleGenAI, Type, Modality, SchemaType, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { StoryRequest, Scenarios, GeneratedStory } from "../types";
import { GEMINI_MODEL_NAME, SYSTEM_INSTRUCTION } from "../constants";

// Initialize Gemini Client
const getAiClient = () => {
  // Try both naming conventions to be safe on Netlify
  const apiKey = process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("CRITICAL: API Key is missing. Check 'API_KEY' or 'VITE_GEMINI_API_KEY' in environment variables.");
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
        // Disable safety settings for creative writing (prevents false positives on "conflict" in fairy tales)
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
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

    // Robust JSON extraction
    let jsonString = response.text.trim();
    // Use regex to find the first '{' and the last '}' to ignore any preamble text
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }

    let json;
    try {
      json = JSON.parse(jsonString);
    } catch (e) {
      console.error("Failed to parse JSON. Raw text:", response.text);
      throw new Error("AI returned invalid JSON format");
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