export type CustomerGrade = 'A' | 'B' | 'C';

export type CustomerStatus =
  | 'New Lead'
  | 'Following Up'
  | 'Quoting'
  | 'Closed'
  | 'Maintenance'
  | 'Lost';

export type AreaZone =
  | 'Jurong'
  | 'Senoko'
  | 'Tuas'
  | 'Mandai'
  | 'Changi'
  | 'Other';

export type RiskLight = 'Green' | 'Yellow' | 'Red';

export type SourceTag =
  | 'Visit'
  | 'Meeting'
  | 'Trade Show'
  | 'Referral'
  | 'WhatsApp';

export type FollowUpChannel = 'Call' | 'Visit' | 'WhatsApp';

export type ExpiryFieldType = 'COE' | 'Insurance' | 'VPC' | 'Servicing';

export type ExpiryUrgency =
  | 'Overdue'
  | '<=7 days'
  | '<=14 days'
  | '<=30 days'
  | 'Scheduled'
  | 'Not seen';

export interface Contact {
  id: string;
  fullName: string;
  title: string;
  phone: string;
  email: string;
  isDecisionMaker: boolean;
  cardImageDataUrl?: string;
  sourceTag?: SourceTag;
  notes: string;
  addedAt: string;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  size: string;
  reeferBrand: string;
  ageYears: number | null;
  coeExpiry: string;
  insuranceExpiry: string;
  vpcExpiry: string;
  servicingDue: string;
  quotedPrice: string;
  notes: string;
}

export interface Customer {
  id: string;
  companyName: string;
  uen: string;
  address: string;
  area: AreaZone;
  industry: string;
  business: string;
  fleetSize: string;
  grade: CustomerGrade;
  status: CustomerStatus;
  riskLight: RiskLight;
  sourceTag: SourceTag;
  tags: string[];
  notes: string;
  contacts: Contact[];
  vehicles: Vehicle[];
  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  customerId: string;
  contactId?: string;
  channel: FollowUpChannel;
  exactCustomerWords: string;
  nextStep: string;
  nextStepDate: string;
  status: 'Pending' | 'Done';
  sourceAudioNote?: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface ExpiryTaskAction {
  key: string; // `${vehicleId}:${type}:${date}`
  status: 'Done' | 'Snoozed';
  snoozedUntil?: string;
  updatedAt: string;
}

export interface AppState {
  customers: Customer[];
  followUps: FollowUp[];
  expiryActions: Record<string, ExpiryTaskAction>;
}

export interface OcrCardResult {
  fullName: string;
  companyName: string;
  title: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export interface FollowUpExtractionResult {
  exactCustomerWords: string;
  nextStep: string;
  suggestedNextDate: string;
}

export interface PhoneMatchResult {
  customer: Customer;
  contact: Contact;
}

export interface VehicleExpiryItem {
  key: string;
  customerId: string;
  companyName: string;
  area: AreaZone;
  grade: CustomerGrade;
  vehicleId: string;
  plateNumber: string;
  vehicleSummary: string;
  reeferBrand: string;
  expiryType: ExpiryFieldType;
  dueDate: string;
  daysDiff: number;
  urgency: ExpiryUrgency;
  primaryPhone: string;
  primaryContactName: string;
}

export type ActiveTab = 'today' | 'scan' | 'customers' | 'data';

export const AREAS: AreaZone[] = [
  'Jurong',
  'Senoko',
  'Tuas',
  'Mandai',
  'Changi',
  'Other',
];

export const GRADES: CustomerGrade[] = ['A', 'B', 'C'];

export const STATUSES: CustomerStatus[] = [
  'New Lead',
  'Following Up',
  'Quoting',
  'Closed',
  'Maintenance',
  'Lost',
];

export const SOURCE_TAGS: SourceTag[] = [
  'Visit',
  'Meeting',
  'Trade Show',
  'Referral',
  'WhatsApp',
];

export const CHANNELS: FollowUpChannel[] = ['Call', 'Visit', 'WhatsApp'];

export const RISK_LIGHTS: RiskLight[] = ['Green', 'Yellow', 'Red'];
