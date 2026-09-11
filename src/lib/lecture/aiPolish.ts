import { generateOnce } from "@/lib/ai/client";
import { getActiveApiKey, getActiveProvider } from "@/lib/ai/storage";
import { appendLectureMarkdown } from "./insert";
import { formatClock } from "./format";
import type { TranscriptChunk } from "./types";

export interface PolishResult {
  success: boolean;
  markdown?: string;
  error?: string;
}

export function hasConfiguredAiProvider(): boolean {
  try {
    const providerId = getActiveProvider();
    const apiKey = getActiveApiKey();
    return Boolean(providerId && apiKey);
  } catch {
    return false;
  }
}

export async function polishAndSummarizeLecture(chunks: TranscriptChunk[]): Promise<PolishResult> {
  if (!chunks || chunks.length === 0) {
    return { success: false, error: "Düzenlenecek bir transkript metni bulunamadı." };
  }

  const rawTranscript = chunks
    .map((c) => `[${formatClock(c.startTime)}] ${c.text.trim()}`)
    .filter((l) => l.length > 8)
    .join("\n");

  if (!rawTranscript.trim()) {
    return { success: false, error: "Transkript içeriği boş." };
  }

  const prompt = `Aşağıda ses tanıma (Speech-to-Text / Whisper) ile kaydedilmiş ham bir ders/toplantı transkripti yer almaktadır.
İçerikte konuşma dilinden, aksandan veya STT hatalarından kaynaklanan yazım yanlışları ve eksik noktalamalar bulunabilir.

Lütfen bu transkripti analiz et ve Türkçe dil bilgisi/yazım kurallarına uygun, son derece düzenli ve profesyonel bir "Ders Notu & Özet" haline getir.

Aşağıdaki Markdown yapısını kullan:

# 🎓 Ders Notu & Özet

## 📌 Genel Bakış
(Konuşmanın özünü, işlenen ana konuyu anlatan 2-3 cümlelik net özet)

## 🎯 Ana Fikirler & Vurgulanan Noktalar
- Madde madde önemli kavramlar ve tespitler

## 📝 Yapılandırılmış Ders İçeriği
(Konuşmadaki bölümleri mantıklı alt başlıklarla özetleyen detaylı ders notları. Varsa teknik terimleri doğru karşılıklarıyla düzelt)

## ⚡ Çıkarımlar & Aksiyon Maddeleri
- Önemli çıkarımlar, yapılacaklar veya hatırlanması gerekenler

Ham Transkript:
"""
${rawTranscript}
"""

Not: Doğrudan yukarıdaki Markdown şablonunu üret. Başında veya sonunda "İşte özet:" gibi gereksiz giriş cümleleri yazma.`;

  try {
    const result = await generateOnce({
      prompt,
      systemInstruction:
        "Sen profesyonel bir akademik not alma ve ders özetleme yapay zekasısın. Çıktılarını temiz, okunaklı Markdown formatında üretirsin.",
    });

    if (!result || !result.trim()) {
      return { success: false, error: "Yapay zeka boş yanıt döndürdü." };
    }

    const trimmed = result.trim();
    appendLectureMarkdown(`\n\n---\n\n${trimmed}\n`);

    return {
      success: true,
      markdown: trimmed,
    };
  } catch (err: any) {
    const msg = err?.message || "AI özeti oluşturulurken bir hata meydana geldi.";
    return {
      success: false,
      error: msg,
    };
  }
}
