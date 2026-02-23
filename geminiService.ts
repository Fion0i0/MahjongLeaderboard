
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiGameResult, GeminiAnalysisResult } from "./types";

export const parseGameWithAI = async (
  prompt: string,
  knownPlayerNames?: string[]
): Promise<GeminiGameResult | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const playerContext = knownPlayerNames && knownPlayerNames.length > 0
    ? `Known players from previous games: ${knownPlayerNames.join(', ')}. Match names to these when possible.`
    : '';

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Parse the following Mahjong game description into structured data.
      The input might be in English, Cantonese, or Mandarin.
      ${playerContext}

      Extract:
      - date: The game date in YYYY-MM-DD format. If not specified, use today's date (${new Date().toISOString().split('T')[0]}).
      - note: Any descriptive note about the game (location, occasion, etc). Empty string if none.
      - players: Array of players with name, score (number), and special hands (comma-separated Chinese text, empty string if none).

      Cantonese/Mandarin hints:
      - Score numbers can follow player names directly
      - 贏/嬴 = won/positive score, 輸 = lost/negative score
      - Special hands: 十三幺, 大四喜, 九蓮寶燈, 字一色, 清么九, 大三元, 小四喜, 四暗刻, 一色四同順, 一色四節高

      Input: "${prompt}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            note: { type: Type.STRING },
            players: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  special: { type: Type.STRING },
                },
                propertyOrdering: ["name", "score", "special"]
              }
            },
          },
          propertyOrdering: ["date", "note", "players"]
        }
      }
    });

    if (!response.text) return null;
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Gemini Game Parsing Error:", error);
    return null;
  }
};

export const analyzePerformanceWithAI = async (
  gamesJson: string,
  year?: number
): Promise<GeminiAnalysisResult | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const yearContext = year ? `Focus on the year ${year}.` : 'Analyze all games.';

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are an entertaining Mahjong commentator. Analyze these Mahjong game records and provide insights.
      ${yearContext}

      Game data (JSON): ${gamesJson}

      Special hand ranking (highest to lowest):
      十三幺(13), 大四喜(12), 九蓮寶燈(11), 字一色(10), 清么九(9), 大三元(8), 小四喜(7), 四暗刻(6), 一色四同順(5), 一色四節高(4)

      Provide:
      - summary: A witty 2-3 sentence overall commentary
      - playerInsights: For each player, a personalized 1-2 sentence analysis of their performance, style, and notable moments
      - funFacts: 2-4 entertaining observations or statistics from the data

      Write in a mix of English and Cantonese/Chinese for flavor. Be humorous but respectful.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            playerInsights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  insight: { type: Type.STRING },
                },
                propertyOrdering: ["name", "insight"]
              }
            },
            funFacts: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
          },
          propertyOrdering: ["summary", "playerInsights", "funFacts"]
        }
      }
    });

    if (!response.text) return null;
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return null;
  }
};
