import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_NAME = 'gemini-2.5-flash';
const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Please check Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: number }).status)
          : 0;
      const isRetryable = status === 429 || status === 503 || status === 500;
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  if (rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API key was rejected. Please verify your API key in Settings > Secrets.',
    };
  }
  if (rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('429')) {
    return {
      status: 429,
      message: 'Gemini API quota temporarily exceeded. Please retry shortly or check your billing tier in Settings > Secrets.',
    };
  }
  if (rawMessage.includes('GEMINI_API_KEY is not configured')) {
    return {
      status: 500,
      message: rawMessage,
    };
  }
  return {
    status: 502,
    message: `Gemini extraction failed: ${rawMessage}`,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, model: MODEL_NAME });
  });

  app.post('/api/ocr-card', async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Missing imageBase64 payload.' });
        return;
      }

      const safeMime =
        typeof mimeType === 'string' && mimeType.startsWith('image/')
          ? mimeType
          : 'image/jpeg';

      const cleanBase64 = imageBase64.includes(',')
        ? imageBase64.split(',')[1]
        : imageBase64;

      const ai = getGeminiClient();

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: safeMime,
                  data: cleanBase64,
                },
              },
              {
                text:
                  'Extract all contact and company fields visible on this business card for a commercial vehicle and cold-chain sales CRM. ' +
                  'STRICT DATA INTEGRITY: Only extract what is visibly printed on the card. Never guess, infer, or invent missing fields. ' +
                  'If a field is not printed on the card, return an empty string "". ' +
                  'For phone, prefer direct mobile/handphone first; include extra numbers, fax, UEN, or website in notes if present.',
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                fullName: {
                  type: Type.STRING,
                  description: 'Full name of the person on the business card, or empty string if absent.',
                },
                companyName: {
                  type: Type.STRING,
                  description: 'Company or organization name, or empty string if absent.',
                },
                title: {
                  type: Type.STRING,
                  description: 'Job title or designation, or empty string if absent.',
                },
                phone: {
                  type: Type.STRING,
                  description: 'Primary mobile or direct phone number as printed, or empty string if absent.',
                },
                email: {
                  type: Type.STRING,
                  description: 'Email address as printed, or empty string if absent.',
                },
                address: {
                  type: Type.STRING,
                  description: 'Office or warehouse street address as printed, or empty string if absent.',
                },
                notes: {
                  type: Type.STRING,
                  description: 'Secondary phone/office line, UEN, website, services, or handwritten notes visibly printed on the card.',
                },
              },
              required: ['fullName', 'companyName', 'title', 'phone', 'email', 'address', 'notes'],
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;

      res.json({
        fullName: typeof parsed.fullName === 'string' ? parsed.fullName.trim() : '',
        companyName: typeof parsed.companyName === 'string' ? parsed.companyName.trim() : '',
        title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
        phone: typeof parsed.phone === 'string' ? parsed.phone.trim() : '',
        email: typeof parsed.email === 'string' ? parsed.email.trim() : '',
        address: typeof parsed.address === 'string' ? parsed.address.trim() : '',
        notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
      });
    } catch (err: unknown) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/extract-followup', async (req: Request, res: Response) => {
    try {
      const { audioBase64, audioMimeType, textNote, todayIso, channel } = req.body as {
        audioBase64?: string;
        audioMimeType?: string;
        textNote?: string;
        todayIso?: string;
        channel?: string;
      };

      const hasAudio = typeof audioBase64 === 'string' && audioBase64.length > 0;
      const hasText = typeof textNote === 'string' && textNote.trim().length > 0;

      if (!hasAudio && !hasText) {
        res.status(400).json({ error: 'Provide either an audio recording or a text note to extract.' });
        return;
      }

      const safeToday =
        typeof todayIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayIso)
          ? todayIso
          : new Date().toISOString().slice(0, 10);

      const safeChannel = typeof channel === 'string' ? channel : 'Visit';

      const parts: Array<
        { inlineData: { mimeType: string; data: string } } | { text: string }
      > = [];

      if (hasAudio && audioBase64) {
        const cleanAudio = audioBase64.includes(',')
          ? audioBase64.split(',')[1]
          : audioBase64;
        const safeAudioMime =
          typeof audioMimeType === 'string' && audioMimeType.startsWith('audio/')
            ? audioMimeType.split(';')[0]
            : 'audio/webm';
        parts.push({
          inlineData: {
            mimeType: safeAudioMime,
            data: cleanAudio,
          },
        });
      }

      const promptLines = [
        `You are structuring a field sales follow-up note for a commercial vehicle and cold-chain sales manager.`,
        `Today's date is ${safeToday}. Channel: ${safeChannel}.`,
        hasText ? `Sales manager note text:\n"""\n${textNote?.trim()}\n"""` : 'Transcribe and analyze the attached audio voice note.',
        `Rules:`,
        `1. exactCustomerWords: Capture faithfully what the customer said, asked, objected to, or requested. Do NOT invent prices, vehicle specifications, or commitments that were not stated.`,
        `2. nextStep: Clear, concrete next action for the sales manager (e.g., "Send 14ft Thermo King quote on WhatsApp", "Call back to confirm trade-in inspection").`,
        `3. suggestedNextDate: Format YYYY-MM-DD based on today (${safeToday}). Resolve relative dates like "tomorrow", "next Monday", "in 3 days". If no specific date is mentioned and channel is Visit/Meeting, default to the next calendar day after ${safeToday}. If none mentioned for other channels, return the next calendar day after ${safeToday}.`,
      ];

      parts.push({ text: promptLines.join('\n') });

      const ai = getGeminiClient();

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                exactCustomerWords: {
                  type: Type.STRING,
                  description: 'Faithful capture of the customer statements, requirements, or objections without inventing missing specs or prices.',
                },
                nextStep: {
                  type: Type.STRING,
                  description: 'Concrete next action item for the sales manager.',
                },
                suggestedNextDate: {
                  type: Type.STRING,
                  description: 'ISO date YYYY-MM-DD for the next follow-up.',
                },
              },
              required: ['exactCustomerWords', 'nextStep', 'suggestedNextDate'],
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;

      res.json({
        exactCustomerWords:
          typeof parsed.exactCustomerWords === 'string' ? parsed.exactCustomerWords.trim() : '',
        nextStep: typeof parsed.nextStep === 'string' ? parsed.nextStep.trim() : '',
        suggestedNextDate:
          typeof parsed.suggestedNextDate === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(parsed.suggestedNextDate.trim())
            ? parsed.suggestedNextDate.trim()
            : '',
      });
    } catch (err: unknown) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lewis Sales Assistant listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
