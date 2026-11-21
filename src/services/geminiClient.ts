import { FollowUpChannel, FollowUpExtractionResult, OcrCardResult } from '../types';

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
