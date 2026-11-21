import {
  AreaZone,
  Customer,
  CustomerGrade,
  CustomerStatus,
  GRADES,
  PhoneMatchResult,
  RISK_LIGHTS,
  RiskLight,
  SOURCE_TAGS,
  SourceTag,
  STATUSES,
} from '../types';
import { findContactByPhone, normalizeArea, normalizePhone } from './helpers';

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCustomersContactsCsv(customers: Customer[]): string {
  const headers = [
    'Company Name',
    'UEN',
    'Area',
    'Address',
    'Industry',
    'Core Business',
    'Fleet Size',
    'Grade',
    'Status',
    'Risk Light',
    'Source Tag',
    'Tags',
    'Contact Name',
    'Title',
    'Phone',
    'Email',
    'Decision Maker',
    'Notes',
  ];

  const rows: string[][] = [headers];

  for (const c of customers) {
    if (c.contacts.length === 0) {
      rows.push([
        c.companyName,
        c.uen,
        c.area,
        c.address,
        c.industry,
        c.business,
        c.fleetSize,
        c.grade,
        c.status,
        c.riskLight,
        c.sourceTag,
        c.tags.join('; '),
        '',
        '',
        '',
        '',
        '',
        c.notes,
      ]);
    } else {
      for (const ct of c.contacts) {
        rows.push([
          c.companyName,
          c.uen,
          c.area,
          c.address,
          c.industry,
          c.business,
          c.fleetSize,
          c.grade,
          c.status,
          c.riskLight,
          ct.sourceTag || c.sourceTag,
          c.tags.join('; '),
          ct.fullName,
          ct.title,
          ct.phone,
          ct.email,
          ct.isDecisionMaker ? 'Yes' : 'No',
          ct.notes || c.notes,
        ]);
      }
    }
  }

  return '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export function exportVehiclesCsv(customers: Customer[]): string {
  const headers = [
    'Company Name',
    'Area',
    'Plate Number',
    'Brand',
    'Model',
    'Size',
    'Reefer Brand',
    'Age (Years)',
    'COE Expiry',
    'Insurance Expiry',
    'VPC Expiry',
    'Servicing Due',
    'Quoted Price',
    'Notes',
  ];

  const rows: string[][] = [headers];

  for (const c of customers) {
    for (const v of c.vehicles) {
      rows.push([
        c.companyName,
        c.area,
        v.plateNumber,
        v.brand,
        v.model,
        v.size,
        v.reeferBrand,
        v.ageYears !== null ? String(v.ageYears) : '',
        v.coeExpiry,
        v.insuranceExpiry,
        v.vpcExpiry,
        v.servicingDue,
        v.quotedPrice,
        v.notes,
      ]);
    }
  }

  return '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * RFC-4180 compliant CSV parser handling quoted fields, escaped quotes, and CRLF/LF.
 */
export function parseCsvMatrix(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r') {
        if (text[i + 1] === '\n') i++;
        row.push(field.trim());
        if (row.some((cell) => cell.length > 0)) rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field.trim());
        if (row.some((cell) => cell.length > 0)) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export interface CsvImportPreviewRow {
  rowIndex: number;
  companyName: string;
  uen: string;
  area: AreaZone;
  address: string;
  industry: string;
  business: string;
  fleetSize: string;
  grade: CustomerGrade;
  status: CustomerStatus;
  riskLight: RiskLight;
  sourceTag: SourceTag;
  tags: string[];
  fullName: string;
  title: string;
  phone: string;
  email: string;
  isDecisionMaker: boolean;
  notes: string;
  duplicateMatch: PhoneMatchResult | null;
  duplicateInFile: boolean;
  action: 'create' | 'merge' | 'skip';
}

function getColumnValue(headers: string[], row: string[], aliases: string[]): string {
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => h === alias || h.includes(alias));
    if (idx !== -1 && row[idx] !== undefined) {
      return row[idx].trim();
    }
  }
  return '';
}

export function parseCsvToImportPreview(
  csvText: string,
  existingCustomers: Customer[]
): CsvImportPreviewRow[] {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) return [];

  const headers = matrix[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const seenPhones = new Set<string>();
  const previewRows: CsvImportPreviewRow[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    const companyName = getColumnValue(headers, row, ['companyname', 'company', 'account', 'customer']);
    const fullName = getColumnValue(headers, row, ['contactname', 'fullname', 'contact', 'name', 'person']);
    const phone = getColumnValue(headers, row, ['phone', 'mobile', 'hp', 'handphone', 'tel', 'whatsapp']);

    if (!companyName && !fullName && !phone) continue;

    const uen = getColumnValue(headers, row, ['uen', 'regno', 'registration']);
    const address = getColumnValue(headers, row, ['address', 'location', 'street']);
    const rawArea = getColumnValue(headers, row, ['area', 'zone', 'region', 'district']);
    const industry = getColumnValue(headers, row, ['industry', 'sector']);
    const business = getColumnValue(headers, row, ['corebusiness', 'business', 'activity']);
    const fleetSize = getColumnValue(headers, row, ['fleetsize', 'fleet', 'size', 'vehicles']);
    const rawGrade = getColumnValue(headers, row, ['grade', 'tier']).toUpperCase();
    const rawStatus = getColumnValue(headers, row, ['status', 'stage']);
    const rawRisk = getColumnValue(headers, row, ['risklight', 'risk']);
    const rawSource = getColumnValue(headers, row, ['sourcetag', 'source']);
    const rawTags = getColumnValue(headers, row, ['tags', 'tag']);
    const title = getColumnValue(headers, row, ['title', 'designation', 'role', 'position']);
    const email = getColumnValue(headers, row, ['email', 'mail']);
    const rawDm = getColumnValue(headers, row, ['decisionmaker', 'dm', 'primary']).toLowerCase();
    const notes = getColumnValue(headers, row, ['notes', 'note', 'remarks', 'comment']);

    const grade: CustomerGrade = GRADES.includes(rawGrade as CustomerGrade)
      ? (rawGrade as CustomerGrade)
      : 'B';

    const status: CustomerStatus =
      STATUSES.find((s) => s.toLowerCase() === rawStatus.toLowerCase()) || 'New Lead';

    const riskLight: RiskLight =
      RISK_LIGHTS.find((r) => r.toLowerCase() === rawRisk.toLowerCase()) || 'Green';

    const sourceTag: SourceTag =
      SOURCE_TAGS.find((s) => s.toLowerCase() === rawSource.toLowerCase()) || 'Visit';

    const area: AreaZone = normalizeArea(rawArea || address);
    const tags = rawTags
      ? rawTags
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const normPhone = normalizePhone(phone);
    const duplicateMatch = findContactByPhone(existingCustomers, phone);
    const duplicateInFile = normPhone.length >= 7 && seenPhones.has(normPhone);
    if (normPhone.length >= 7) seenPhones.add(normPhone);

    previewRows.push({
      rowIndex: i,
      companyName: companyName || (fullName ? `${fullName} (Prospect)` : 'Unnamed Account'),
      uen,
      area,
      address,
      industry,
      business,
      fleetSize,
      grade,
      status,
      riskLight,
      sourceTag,
      tags,
      fullName,
      title,
      phone,
      email,
      isDecisionMaker: rawDm === 'yes' || rawDm === 'true' || rawDm === '1',
      notes,
      duplicateMatch,
      duplicateInFile,
      action: duplicateMatch ? 'merge' : duplicateInFile ? 'skip' : 'create',
    });
  }

  return previewRows;
}

export function getSampleCsvTemplate(): string {
  const rows = [
    [
      'Company Name',
      'UEN',
      'Area',
      'Address',
      'Industry',
      'Core Business',
      'Fleet Size',
      'Grade',
      'Status',
      'Risk Light',
      'Source Tag',
      'Tags',
      'Contact Name',
      'Title',
      'Phone',
      'Email',
      'Decision Maker',
      'Notes',
    ],
    [
      'Mandai Chilled Meats Pte Ltd',
      '201824519K',
      'Mandai',
      '38 Mandai Estate #02-11, Singapore 729927',
      'Food & Cold Chain',
      'Frozen halal meat wholesale to central kitchens',
      '9 trucks',
      'A',
      'New Lead',
      'Green',
      'Referral',
      'Chiller 14ft; Trade-In',
      'Jason Tan',
      'Fleet Manager',
      '+65 9812 4401',
      'jason@mandaichilled.sg',
      'Yes',
      'Looking to replace 2 older diesel 14ft reefers in Q1',
    ],
    [
      'Pacific Cold Logistics Pte Ltd',
      '201219844M',
      'Jurong',
      '18 Fishery Port Road, Jurong, Singapore 619736',
      'Cold-Chain Logistics',
      'Chilled seafood and frozen poultry distribution',
      '14 vehicles',
      'A',
      'Quoting',
      'Green',
      'Visit',
      'Key Account',
      'Raymond Tan',
      'Operations Director',
      '91234567',
      'raymond.tan@pacificcold.sg',
      'Yes',
      'Duplicate phone test row — should flag Merge into Existing',
    ],
  ];
  return '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
}
