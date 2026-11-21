import { FollowUpChannel, FollowUpExtractionResult, OcrCardResult } from '../types';

export interface DocumentField {
  label: string;
  value: string;
}

export interface DocumentAnalysisResult {
  documentType: string;
  summary: string;
  answer: string;
  extractedFields: DocumentField[];
  risksAndFlags: string[];
  suggestedNextStep: string;
}

export async function extractBusinessCardOcr(
  imageDataUrl: string,
  mimeType = 'image/jpeg'
): Promise<OcrCardResult> {
  const response = await fetch('/api/ocr-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: imageDataUrl,
      mimeType,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<OcrCardResult> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `OCR request failed (${response.status}).`);
  }

  return {
    fullName: data.fullName || '',
    chineseName: data.chineseName || '',
    companyName: data.companyName || '',
    chineseCompanyName: data.chineseCompanyName || '',
    title: data.title || '',
    phone: data.phone || '',
    secondaryPhone: data.secondaryPhone || '',
    email: data.email || '',
    uen: data.uen || '',
    address: data.address || '',
    notes: data.notes || '',
  };
}

export async function extractFollowUpFromInput(params: {
  audioBase64?: string;
  audioMimeType?: string;
  textNote?: string;
  todayIso: string;
  channel: FollowUpChannel;
}): Promise<FollowUpExtractionResult> {
  const response = await fetch('/api/extract-followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<FollowUpExtractionResult> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `Follow-up extraction failed (${response.status}).`);
  }

  return {
    exactCustomerWords: data.exactCustomerWords || '',
    nextStep: data.nextStep || '',
    suggestedNextDate: data.suggestedNextDate || '',
  };
}

export async function checkAiHealth(): Promise<{
  ok: boolean;
  model: string;
  emailConfigured: boolean;
  geminiConfigured: boolean;
}> {
  try {
    const res = await fetch('/api/health');
    const raw = await res.text();
    if (!res.ok || raw.trim().startsWith('<')) {
      return { ok: false, model: '', emailConfigured: false, geminiConfigured: false };
    }
    const data = JSON.parse(raw);
    return {
      ok: Boolean(data.ok),
      model: data.model || '',
      emailConfigured: Boolean(data.emailConfigured),
      geminiConfigured: Boolean(data.geminiConfigured),
    };
  } catch {
    return { ok: false, model: '', emailConfigured: false, geminiConfigured: false };
  }
}

export async function analyzeUploadedDocument(params: {
  fileBase64: string;
  mimeType: string;
  fileName?: string;
  question?: string;
}): Promise<DocumentAnalysisResult> {
  const response = await fetch('/api/analyze-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<DocumentAnalysisResult> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `Document analysis failed (${response.status}).`);
  }

  return {
    documentType: data.documentType || 'General Document',
    summary: data.summary || '',
    answer: data.answer || '',
    extractedFields: Array.isArray(data.extractedFields) ? data.extractedFields : [],
    risksAndFlags: Array.isArray(data.risksAndFlags) ? data.risksAndFlags : [],
    suggestedNextStep: data.suggestedNextStep || '',
  };
}
