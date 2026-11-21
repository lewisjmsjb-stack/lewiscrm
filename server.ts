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

  const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

  app.post('/api/auth/send-otp', async (req: Request, res: Response) => {
    const { email: rawEmail } = req.body as { email?: string; identifier?: string };
    const email = (rawEmail || (req.body as { identifier?: string }).identifier || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email, { code, expiresAt, attempts: 0 });

    const brevoApiKey = process.env.BREVO_API_KEY;
    const resendApiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM || 'lewis.jmsjb@gmail.com';

    let emailSent = false;
    let emailErrorMsg = '';

    if (brevoApiKey && brevoApiKey !== 'MY_BREVO_API_KEY') {
      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': brevoApiKey,
          },
          body: JSON.stringify({
            sender: { name: 'Lewis Sales Assistant', email: emailFrom },
            to: [{ email }],
            subject: 'Your Lewis Sales Assistant Verification Code',
            htmlContent: `<div style="font-family:sans-serif;padding:20px;background:#f8fafc;border-radius:12px;"><h2>Verification Code</h2><p>Your 6-digit verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#2563eb;">${code}</p><p>This code expires in 10 minutes. If you did not request this, please ignore.</p></div>`,
          }),
        });
        if (response.ok) {
          emailSent = true;
        } else {
          emailErrorMsg = await response.text();
          console.warn('Brevo email delivery failed:', emailErrorMsg);
        }
      } catch (err) {
        console.warn('Brevo request error:', err);
      }
    }

    if (!emailSent && resendApiKey && resendApiKey !== 'MY_RESEND_API_KEY') {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: emailFrom.includes('@') ? emailFrom : 'Lewis Sales Assistant <onboarding@resend.dev>',
            to: [email],
            subject: 'Your Lewis Sales Assistant Verification Code',
            html: `<div style="font-family:sans-serif;padding:20px;background:#f8fafc;border-radius:12px;"><h2>Verification Code</h2><p>Your 6-digit verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#2563eb;">${code}</p><p>This code expires in 10 minutes. If you did not request this, please ignore.</p></div>`,
          }),
        });
        if (response.ok) {
          emailSent = true;
        } else {
          emailErrorMsg = await response.text();
          console.warn('Resend email delivery failed:', emailErrorMsg);
        }
      } catch (err) {
        console.warn('Resend request error:', err);
      }
    }

    if ((!brevoApiKey || brevoApiKey === 'MY_BREVO_API_KEY') && (!resendApiKey || resendApiKey === 'MY_RESEND_API_KEY')) {
      res.status(503).json({
        error: 'Email delivery service is not configured. Admin must add BREVO_API_KEY or RESEND_API_KEY in Settings > Secrets.',
      });
      return;
    }

    if (!emailSent && (brevoApiKey || resendApiKey)) {
      res.status(502).json({ error: `Failed to send email via provider: ${emailErrorMsg || 'Unknown error'}` });
      return;
    }

    const [local, domain] = email.split('@');
    const maskedLocal = local.length <= 2 ? local + '***' : local.slice(0, 2) + '***';
    const maskedEmail = `${maskedLocal}@${domain}`;

    res.json({ success: true, maskedEmail });
  });

  app.post('/api/auth/verify-otp', async (req: Request, res: Response) => {
    const { email: rawEmail, code } = req.body as { email?: string; code?: string };
    const email = (rawEmail || '').trim().toLowerCase();
    const cleanCode = (code || '').trim();

    if (!email || !cleanCode) {
      res.status(400).json({ error: 'Email and verification code are required.' });
      return;
    }

    const record = otpStore.get(email);
    if (!record || Date.now() > record.expiresAt || record.attempts >= 5) {
      if (record) {
        record.attempts++;
      }
      res.status(400).json({ error: 'Invalid or expired verification code.' });
      return;
    }

    if (record.code !== cleanCode) {
      record.attempts++;
      res.status(400).json({ error: 'Invalid or expired verification code.' });
      return;
    }

    otpStore.delete(email);
    res.json({ success: true, verified: true });
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
                chineseName: {
                  type: Type.STRING,
                  description: 'Chinese characters name if present, or empty string if absent.',
                },
                companyName: {
                  type: Type.STRING,
                  description: 'Company or organization name, or empty string if absent.',
                },
                chineseCompanyName: {
                  type: Type.STRING,
                  description: 'Chinese company name if present, or empty string if absent.',
                },
                title: {
                  type: Type.STRING,
                  description: 'Job title or designation, or empty string if absent.',
                },
                phone: {
                  type: Type.STRING,
                  description: 'Primary mobile or direct phone number as printed, or empty string if absent.',
                },
                secondaryPhone: {
                  type: Type.STRING,
                  description: 'Office direct line, fax, or secondary phone number if present, or empty string if absent.',
                },
                email: {
                  type: Type.STRING,
                  description: 'Email address as printed, or empty string if absent.',
                },
                uen: {
                  type: Type.STRING,
                  description: 'Company UEN or business registration number if printed, or empty string if absent.',
                },
                address: {
                  type: Type.STRING,
                  description: 'Office or warehouse street address as printed, or empty string if absent.',
                },
                notes: {
                  type: Type.STRING,
                  description: 'Website, services, or handwritten notes visibly printed on the card.',
                },
              },
              required: [
                'fullName',
                'chineseName',
                'companyName',
                'chineseCompanyName',
                'title',
                'phone',
                'secondaryPhone',
                'email',
                'uen',
                'address',
                'notes',
              ],
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('Failed to parse Gemini OCR JSON response:', rawText, parseErr);
        res.status(502).json({ error: 'Model returned malformed JSON response for card OCR.' });
        return;
      }

      res.json({
        fullName: typeof parsed.fullName === 'string' ? parsed.fullName.trim() : '',
        chineseName: typeof parsed.chineseName === 'string' ? parsed.chineseName.trim() : '',
        companyName: typeof parsed.companyName === 'string' ? parsed.companyName.trim() : '',
        chineseCompanyName:
          typeof parsed.chineseCompanyName === 'string' ? parsed.chineseCompanyName.trim() : '',
        title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
        phone: typeof parsed.phone === 'string' ? parsed.phone.trim() : '',
        secondaryPhone:
          typeof parsed.secondaryPhone === 'string' ? parsed.secondaryPhone.trim() : '',
        email: typeof parsed.email === 'string' ? parsed.email.trim() : '',
        uen: typeof parsed.uen === 'string' ? parsed.uen.trim() : '',
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
        `3. suggestedNextDate: Format YYYY-MM-DD based on today (${safeToday}). Resolve relative dates like "tomorrow", "next Monday", "in 3 days". If no specific date is mentioned, default to the next calendar day after ${safeToday}.`,
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
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('Failed to parse Gemini follow-up JSON response:', rawText, parseErr);
        res.status(502).json({ error: 'Model returned malformed JSON response for follow-up extraction.' });
        return;
      }

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

  app.all('/api/{*splat}', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API route not found. Please restart the server.' });
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
