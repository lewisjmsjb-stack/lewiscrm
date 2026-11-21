import {
  AREAS,
  AreaZone,
  Customer,
  ExpiryFieldType,
  ExpiryTaskAction,
  ExpiryUrgency,
  PhoneMatchResult,
  Vehicle,
  VehicleExpiryItem,
} from '../types';

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(baseIso: string, deltaDays: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function diffDaysFromToday(targetIso: string, todayIso: string = getTodayIso()): number | null {
  if (!targetIso || !/^\d{4}-\d{2}-\d{2}$/.test(targetIso)) return null;
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [ey, em, ed] = targetIso.split('-').map(Number);
  const t0 = Date.UTC(ty, tm - 1, td);
  const t1 = Date.UTC(ey, em - 1, ed);
  return Math.round((t1 - t0) / (1000 * 60 * 60 * 24));
}

export function formatReadableDate(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Not seen';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTodayBanner(): string {
  return new Date().toLocaleDateString('en-SG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Strict data integrity helpers: never invent blank values.
 */
export function displayText(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return 'Not seen';
  const str = String(val).trim();
  return str.length > 0 ? str : 'Not seen';
}

export function displayQuote(val: string | null | undefined): string {
  if (!val || val.trim().length === 0) return 'Ask for a quote';
  return val.trim();
}

/**
 * Normalize phone numbers by stripping spaces, dashes, parentheses, dots, and plus signs.
 * For Singapore numbers (+65XXXXXXXX vs XXXXXXXX), also compares normalized 8-digit local core.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[\s\-().+]/g, '').replace(/[^0-9]/g, '');
}

export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Handle SG country code 65 prefix mismatch (e.g. 6591234567 vs 91234567)
  const coreA = na.length === 10 && na.startsWith('65') ? na.slice(2) : na;
  const coreB = nb.length === 10 && nb.startsWith('65') ? nb.slice(2) : nb;
  return coreA.length >= 7 && coreA === coreB;
}

export function findContactByPhone(
  customers: Customer[],
  phone: string
): PhoneMatchResult | null {
  if (!normalizePhone(phone)) return null;
  for (const customer of customers) {
    for (const contact of customer.contacts) {
      if (phonesMatch(contact.phone, phone)) {
        return { customer, contact };
      }
    }
  }
  return null;
}

export function inferAreaFromAddress(address: string): AreaZone {
  const lower = (address || '').toLowerCase();
  if (lower.includes('jurong') || lower.includes('pioneer') || lower.includes('boon lay') || lower.includes('pandan')) {
    return 'Jurong';
  }
  if (lower.includes('senoko') || lower.includes('woodlands') || lower.includes('admiralty') || lower.includes('sembawang')) {
    return 'Senoko';
  }
  if (lower.includes('tuas') || lower.includes('gul')) {
    return 'Tuas';
  }
  if (lower.includes('mandai') || lower.includes('sungei kadut') || lower.includes('kranji')) {
    return 'Mandai';
  }
  if (lower.includes('changi') || lower.includes('loyang') || lower.includes('tampines') || lower.includes('pasir ris')) {
    return 'Changi';
  }
  return 'Other';
}

export function normalizeArea(raw: string): AreaZone {
  const found = AREAS.find((a) => a.toLowerCase() === (raw || '').trim().toLowerCase());
  if (found) return found;
  return inferAreaFromAddress(raw || '');
}

export function classifyExpiryUrgency(daysDiff: number | null): ExpiryUrgency {
  if (daysDiff === null) return 'Not seen';
  if (daysDiff < 0) return 'Overdue';
  if (daysDiff <= 7) return '<=7 days';
  if (daysDiff <= 14) return '<=14 days';
  if (daysDiff <= 30) return '<=30 days';
  return 'Scheduled';
}

export function buildVehicleExpiryItems(
  customers: Customer[],
  todayIso: string = getTodayIso()
): VehicleExpiryItem[] {
  const items: VehicleExpiryItem[] = [];
  const fields: Array<{ key: keyof Vehicle; label: ExpiryFieldType }> = [
    { key: 'coeExpiry', label: 'COE' },
    { key: 'insuranceExpiry', label: 'Insurance' },
    { key: 'vpcExpiry', label: 'VPC' },
    { key: 'servicingDue', label: 'Servicing' },
  ];

  for (const customer of customers) {
    const primaryContact =
      customer.contacts.find((c) => c.isDecisionMaker) || customer.contacts[0];
    for (const vehicle of customer.vehicles) {
      const summary = [vehicle.brand, vehicle.model, vehicle.size]
        .filter((s) => s && s.trim())
        .join(' ');
      for (const f of fields) {
        const dueDate = String(vehicle[f.key] || '').trim();
        if (!dueDate) continue;
        const daysDiff = diffDaysFromToday(dueDate, todayIso);
        if (daysDiff === null) continue;
        const urgency = classifyExpiryUrgency(daysDiff);
        items.push({
          key: `${vehicle.id}:${f.label}:${dueDate}`,
          customerId: customer.id,
          companyName: customer.companyName,
          area: customer.area,
          grade: customer.grade,
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber || 'Not seen',
          vehicleSummary: summary || 'Not seen',
          reeferBrand: vehicle.reeferBrand || 'Not seen',
          expiryType: f.label,
          dueDate,
          daysDiff,
          urgency,
          primaryPhone: primaryContact?.phone || '',
          primaryContactName: primaryContact?.fullName || 'Not seen',
        });
      }
    }
  }

  return items.sort((a, b) => a.daysDiff - b.daysDiff);
}

export function isExpiryReminderActive(
  item: VehicleExpiryItem,
  expiryActions: Record<string, ExpiryTaskAction>,
  todayIso: string = getTodayIso()
): boolean {
  if (item.daysDiff > 30) return false;
  const action = expiryActions[item.key];
  if (!action) return true;
  if (action.status === 'Done') return false;
  if (action.status === 'Snoozed' && action.snoozedUntil && action.snoozedUntil > todayIso) {
    return false;
  }
  return true;
}

export function getWhatsAppUrl(phone: string, prefillText?: string): string {
  let digits = normalizePhone(phone);
  if (digits.length === 8) {
    digits = `65${digits}`;
  }
  const base = `https://wa.me/${digits}`;
  if (prefillText) {
    return `${base}?text=${encodeURIComponent(prefillText)}`;
  }
  return base;
}

export function getTelUrl(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}

/**
 * Compresses an uploaded business card image into a clean JPEG data URL so it stays crisp
 * for OCR and remains lightweight enough for localStorage persistence.
 */
export function compressImageFile(file: File, maxDimension = 1200, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to encode audio file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

export function formatRelativeDue(daysDiff: number | null): string {
  if (daysDiff === null) return 'Not seen';
  if (daysDiff < -1) return `${Math.abs(daysDiff)}d overdue`;
  if (daysDiff === -1) return '1d overdue';
  if (daysDiff === 0) return 'Due today';
  if (daysDiff === 1) return 'Tomorrow';
  return `In ${daysDiff}d`;
}
