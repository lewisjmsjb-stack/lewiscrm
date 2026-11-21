/**
 * Hash a plain password string using Web Crypto SHA-256.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function validatePassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 6;
}

export function normalizeEmail(email?: string): string {
  return (email || '').trim().toLowerCase();
}

export function normalizePhone(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/[\s\-().+]/g, '').replace(/[^0-9]/g, '');
}

export function identifiersMatch(
  storedEmail: string,
  storedPhone: string,
  input: string
): boolean {
  const normInput = input.trim();
  if (!normInput) return false;

  const isEmailInput = normInput.includes('@');
  if (isEmailInput) {
    return normalizeEmail(storedEmail) === normalizeEmail(normInput);
  } else {
    const normStoredPhone = normalizePhone(storedPhone);
    const normInputPhone = normalizePhone(normInput);
    if (!normStoredPhone || !normInputPhone) return false;
    return normStoredPhone === normInputPhone || normStoredPhone.endsWith(normInputPhone) || normInputPhone.endsWith(normStoredPhone);
  }
}
