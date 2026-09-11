import { getApiKeyFor } from "@/lib/ai/storage";
import type { LectureEngine, LectureLanguage } from "./types";

/**
 * Calculates Root Mean Square (RMS) of PCM audio to detect pure silence.
 */
export function calculateRms(pcm: Float32Array): number {
  if (!pcm || pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    sum += pcm[i] * pcm[i];
  }
  return Math.sqrt(sum / pcm.length);
}

/**
 * Encodes Float32Array PCM samples into standard 16-bit mono PCM WAV Base64.
 */
export function pcmToWavBase64(pcm: Float32Array, sampleRate = 16000): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Write WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Write PCM Int16 samples
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  // Convert buffer to binary string, then base64
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

export function getGeminiApiKey(): string {
  // 1. Check AI storage (saved in Wings AI settings)
  const key = getApiKeyFor("google");
  if (key && key.trim()) return key.trim();

  // 2. Check environment variables if available
  const envKey =
    (typeof process !== "undefined" && (process.env?.GEMINI_API_KEY || process.env?.GOOGLE_API_KEY)) ||
    (typeof import.meta !== "undefined" &&
      ((import.meta as any).env?.VITE_GEMINI_API_KEY ||
        (import.meta as any).env?.GEMINI_API_KEY ||
        (import.meta as any).env?.GOOGLE_API_KEY));
  if (envKey && typeof envKey === "string" && envKey.trim()) return envKey.trim();

  return "";
}

export function createGeminiAudioEngine(options: {
  apiKey?: string;
  language: LectureLanguage;
}): LectureEngine {
  return {
    id: "gemini",
    async load() {
      const key = options.apiKey || getGeminiApiKey();
      if (!key) {
        throw new Error(
          "Google (Gemini) API anahtarı bulunamadı. Lütfen sağdaki AI panelinden veya API ayarlarından anahtarınızı girin."
        );
      }
    },
    async transcribe(input) {
      const key = options.apiKey || getGeminiApiKey();
      if (!key) {
        throw new Error("Missing Gemini API key.");
      }

      // Check if chunk is pure silence (RMS < 0.003) to save bandwidth and prevent hallucinations
      const rms = calculateRms(input.pcm);
      if (rms < 0.003) {
        return { text: "", language: options.language };
      }

      const wavBase64 = pcmToWavBase64(input.pcm, input.sampleRate);
      const isTurkish = options.language === "tr" || options.language === "auto";

      const prompt = isTurkish
        ? "Bu ses kaydını harfi harfine, Türkçe dil bilgisi, imla ve noktalama kurallarına uygun şekilde yazıya dök (transkripsiyon yap). Yalnızca söylenen metni üret. Başında veya sonunda 'İşte metin:' gibi fazladan yorum, selamlama veya açıklama yazma. Anlaşılır bir konuşma yoksa boş bırak."
        : "Transcribe this audio recording verbatim with proper punctuation and capitalization. Output only the transcribed speech. If silent or unintelligible, output nothing.";

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: "audio/wav",
                    data: wavBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000,
          },
        }),
      });

      if (!response.ok) {
        const errorDetail = await response.text();
        throw new Error(`Gemini Audio API Error (${response.status}): ${errorDetail.slice(0, 200)}`);
      }

      const json = await response.json();
      const text =
        json?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text || "")
          .join("")
          .trim() || "";

      return {
        text,
        language: options.language,
      };
    },
    stop() {},
  };
}
