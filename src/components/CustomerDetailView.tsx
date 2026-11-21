import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Edit3,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Truck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  AREAS,
  AreaZone,
  Contact,
  Customer,
  CustomerGrade,
  CustomerStatus,
  FollowUp,
  FollowUpChannel,
  GRADES,
  RISK_LIGHTS,
  RiskLight,
  STATUSES,
  Vehicle,
} from '../types';
import {
  classifyExpiryUrgency,
  diffDaysFromToday,
  displayQuote,
  displayText,
  findContactByPhone,
  formatReadableDate,
  formatRelativeDue,
  generateId,
  getTelUrl,
  getTodayIso,
  getWhatsAppUrl,
} from '../utils/helpers';

interface CustomerDetailViewProps {
  customer: Customer;
  allCustomers: Customer[];
  followUps: FollowUp[];
  onBack: () => void;
  onUpdateCustomer: (updated: Customer) => void;
  onOpenNewFollowUp: (prefill?: {
    customerId?: string;
    channel?: FollowUpChannel;
    nextStep?: string;
  }) => void;
  onToggleFollowUpDone: (followUpId: string) => void;
}

export const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({
  customer,
  allCustomers,
  followUps,
  onBack,
  onUpdateCustomer,
  onOpenNewFollowUp,
  onToggleFollowUpDone,
}) => {
  const today = getTodayIso();
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isEditingCompany, setIsEditingCompany] = useState<boolean>(false);
  const [isAddingContact, setIsAddingContact] = useState<boolean>(false);
  const [isAddingVehicle, setIsAddingVehicle] = useState<boolean>(false);

  // Edit Company Form state
  const [editForm, setEditForm] = useState({
    companyName: customer.companyName,
    uen: customer.uen,
    address: customer.address,
    area: customer.area,
    industry: customer.industry,
    business: customer.business,
    fleetSize: customer.fleetSize,
    tagsText: customer.tags.join(', '),
    notes: customer.notes,
  });

  // Add Contact Form state
  const [contactForm, setContactForm] = useState({
    fullName: '',
    title: '',
    phone: '',
    email: '',
    isDecisionMaker: false,
    notes: '',
  });

  // Add Vehicle Form state
  const [vehicleForm, setVehicleForm] = useState({
    plateNumber: '',
    brand: '',
    model: '',
    size: '',
    reeferBrand: '',
    ageYears: '',
    coeExpiry: '',
    insuranceExpiry: '',
    vpcExpiry: '',
    servicingDue: '',
    quotedPrice: '',
    notes: '',
  });

  const customerFollowUps = useMemo(() => {
    return followUps
      .filter((f) => f.customerId === customer.id)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'Pending' ? -1 : 1;
        return b.nextStepDate.localeCompare(a.nextStepDate);
      });
  }, [followUps, customer.id]);

  const contactDuplicate = useMemo(() => {
    if (!contactForm.phone.trim()) return null;
    return findContactByPhone(allCustomers, contactForm.phone);
  }, [allCustomers, contactForm.phone]);

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCustomer({
      ...customer,
      companyName: editForm.companyName.trim() || customer.companyName,
      uen: editForm.uen.trim(),
      address: editForm.address.trim(),
      area: editForm.area,
      industry: editForm.industry.trim(),
      business: editForm.business.trim(),
      fleetSize: editForm.fleetSize.trim(),
      tags: editForm.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: editForm.notes.trim(),
      updatedAt: today,
    });
    setIsEditingCompany(false);
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.fullName.trim() && !contactForm.phone.trim()) return;
    const newContact: Contact = {
      id: generateId('ct'),
      fullName: contactForm.fullName.trim() || 'Unnamed Contact',
      title: contactForm.title.trim(),
      phone: contactForm.phone.trim(),
      email: contactForm.email.trim(),
      isDecisionMaker: contactForm.isDecisionMaker,
      notes: contactForm.notes.trim(),
      addedAt: today,
    };
    onUpdateCustomer({
      ...customer,
      contacts: [...customer.contacts, newContact],
      updatedAt: today,
    });
    setContactForm({
      fullName: '',
      title: '',
      phone: '',
      email: '',
      isDecisionMaker: false,
      notes: '',
    });
    setIsAddingContact(false);
  };

  const handleAddVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.plateNumber.trim() && !vehicleForm.model.trim()) return;
    const parsedAge = vehicleForm.ageYears.trim()
      ? Number(vehicleForm.ageYears.trim())
      : null;
    const newVehicle: Vehicle = {
      id: generateId('veh'),
      plateNumber: vehicleForm.plateNumber.trim().toUpperCase(),
      brand: vehicleForm.brand.trim(),
      model: vehicleForm.model.trim(),
      size: vehicleForm.size.trim(),
      reeferBrand: vehicleForm.reeferBrand.trim(),
      ageYears: parsedAge !== null && !Number.isNaN(parsedAge) ? parsedAge : null,
      coeExpiry: vehicleForm.coeExpiry,
      insuranceExpiry: vehicleForm.insuranceExpiry,
      vpcExpiry: vehicleForm.vpcExpiry,
      servicingDue: vehicleForm.servicingDue,
      quotedPrice: vehicleForm.quotedPrice.trim(),
      notes: vehicleForm.notes.trim(),
    };
    onUpdateCustomer({
      ...customer,
      vehicles: [...customer.vehicles, newVehicle],
      updatedAt: today,
    });
    setVehicleForm({
      plateNumber: '',
      brand: '',
      model: '',
      size: '',
      reeferBrand: '',
      ageYears: '',
      coeExpiry: '',
      insuranceExpiry: '',
      vpcExpiry: '',
      servicingDue: '',
      quotedPrice: '',
      notes: '',
    });
    setIsAddingVehicle(false);
  };

  const renderExpiryCell = (dateStr: string) => {
    if (!dateStr) {
      return <span className="text-xs text-slate-400">Not seen</span>;
    }
    const diff = diffDaysFromToday(dateStr, today);
    const urgency = classifyExpiryUrgency(diff);
    const color =
      urgency === 'Overdue' || urgency === '<=7 days'
        ? 'text-red-700 font-semibold'
        : urgency === '<=14 days'
          ? 'text-amber-700 font-semibold'
          : urgency === '<=30 days'
            ? 'text-blue-700 font-semibold'
            : 'text-slate-700';

    return (
      <div>
        <div className={`text-xs font-mono tabular-nums ${color}`}>
          {formatReadableDate(dateStr)}
        </div>
        {urgency !== 'Scheduled' && (
          <div className={`text-[11px] ${color}`}>
            {urgency} ({formatRelativeDue(diff)})
          </div>
        )}
      </div>
    );
  };

  const riskDotClass =
    customer.riskLight === 'Red'
      ? 'bg-red-600'
      : customer.riskLight === 'Yellow'
        ? 'bg-amber-500'
        : 'bg-emerald-600';

  return (
    <div className="space-y-6">
      {/* Back + Top Identity Bar */}
      <div className="space-y-4 pb-5 border-b border-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] -ml-2 px-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Customers</span>
        </button>

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {customer.companyName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
              <span className="font-mono tabular-nums">UEN: {displayText(customer.uen)}</span>
              <span aria-hidden="true">·</span>
              <span>{customer.area}</span>
              <span aria-hidden="true">·</span>
              <span>Source: {customer.sourceTag}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                <span className={`w-2 h-2 rounded-full ${riskDotClass}`} aria-hidden="true" />
                Risk: {customer.riskLight}
              </span>
            </div>
          </div>

          {/* Inline Grade / Status / Risk Controls + Primary Follow-Up CTA */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Customer grade"
              value={customer.grade}
              onChange={(e) =>
                onUpdateCustomer({
                  ...customer,
                  grade: e.target.value as CustomerGrade,
                  updatedAt: today,
                })
              }
              className="min-h-[42px] px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-xl text-slate-900"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>

            <select
              aria-label="Customer status"
              value={customer.status}
              onChange={(e) =>
                onUpdateCustomer({
                  ...customer,
                  status: e.target.value as CustomerStatus,
                  updatedAt: today,
                })
              }
              className="min-h-[42px] px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-blue-800"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              aria-label="Risk light"
              value={customer.riskLight}
              onChange={(e) =>
                onUpdateCustomer({
                  ...customer,
                  riskLight: e.target.value as RiskLight,
                  updatedAt: today,
                })
              }
              className="min-h-[42px] px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800"
            >
              {RISK_LIGHTS.map((r) => (
                <option key={r} value={r}>
                  Risk: {r}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onOpenNewFollowUp({ customerId: customer.id, channel: 'Visit' })}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Follow-Up</span>
            </button>
          </div>
        </div>
      </div>

      {/* Single-Page 360° Layout: Clean Whitespace + Hairline Sections */}
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
        {/* SECTION 1: COMPANY PROFILE */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Company Profile</h2>
            <button
              type="button"
              onClick={() => {
                setEditForm({
                  companyName: customer.companyName,
                  uen: customer.uen,
                  address: customer.address,
                  area: customer.area,
                  industry: customer.industry,
                  business: customer.business,
                  fleetSize: customer.fleetSize,
                  tagsText: customer.tags.join(', '),
                  notes: customer.notes,
                });
                setIsEditingCompany((v) => !v);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingCompany ? 'Cancel Edit' : 'Edit Profile'}</span>
            </button>
          </div>

          {isEditingCompany ? (
            <form onSubmit={handleSaveCompany} className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={editForm.companyName}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">UEN</label>
                <input
                  type="text"
                  value={editForm.uen}
                  onChange={(e) => setEditForm({ ...editForm, uen: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Area</label>
                <select
                  value={editForm.area}
                  onChange={(e) => setEditForm({ ...editForm, area: e.target.value as AreaZone })}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                >
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fleet Size</label>
                <input
                  type="text"
                  value={editForm.fleetSize}
                  onChange={(e) => setEditForm({ ...editForm, fleetSize: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Industry</label>
                <input
                  type="text"
                  value={editForm.industry}
                  onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={editForm.tagsText}
                  onChange={(e) => setEditForm({ ...editForm, tagsText: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Core Business</label>
                <input
                  type="text"
                  value={editForm.business}
                  onChange={(e) => setEditForm({ ...editForm, business: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Notes</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingCompany(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Save Profile
                </button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Industry</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{displayText(customer.industry)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Fleet Size</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{displayText(customer.fleetSize)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Address</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{displayText(customer.address)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Core Business</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{displayText(customer.business)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tags</dt>
                <dd className="text-slate-800 mt-0.5">
                  {customer.tags.length > 0 ? customer.tags.join(' · ') : 'Not seen'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Last Updated</dt>
                <dd className="font-mono tabular-nums text-slate-800 mt-0.5">
                  {formatReadableDate(customer.updatedAt)}
                </dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-xs text-slate-500">Sales Notes</dt>
                <dd className="text-slate-700 mt-0.5 leading-relaxed">{displayText(customer.notes)}</dd>
              </div>
            </dl>
          )}
        </section>

        {/* SECTION 2: DECISION-CHAIN CONTACTS + BUSINESS CARD PREVIEWS */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Decision-Chain Contacts ({customer.contacts.length})
              </h2>
              <p className="text-xs text-slate-500">
                Direct lines, roles, and stored scanned business card images.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingContact((v) => !v)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isAddingContact ? 'Close' : 'Add Contact'}</span>
            </button>
          </div>

          {isAddingContact && (
            <form
              onSubmit={handleAddContact}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              {contactDuplicate && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    Phone already exists on <strong>{contactDuplicate.contact.fullName}</strong> (
                    {contactDuplicate.customer.companyName}). Double-check before adding a duplicate.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Full name *"
                  value={contactForm.fullName}
                  onChange={(e) => setContactForm({ ...contactForm, fullName: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Title / Designation"
                  value={contactForm.title}
                  onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                />
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl"
                />
                <input
                  type="email"
                  placeholder="Email address"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Notes"
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                  className="sm:col-span-2 min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={contactForm.isDecisionMaker}
                    onChange={(e) =>
                      setContactForm({ ...contactForm, isDecisionMaker: e.target.checked })
                    }
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span>Decision Maker</span>
                </label>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-1.5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Save Contact
                </button>
              </div>
            </form>
          )}

          {customer.contacts.length === 0 ? (
            <p className="text-sm text-slate-500">No contacts recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 border-t border-slate-100">
              {customer.contacts.map((ct) => (
                <div
                  key={ct.id}
                  className="py-4 first:pt-2 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold text-slate-900">{ct.fullName}</span>
                      <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                      <span className="text-xs text-slate-600">{displayText(ct.title)}</span>
                      {ct.isDecisionMaker && (
                        <>
                          <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                          <span className="text-xs font-semibold text-blue-700">
                            Decision Maker
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span className="font-mono tabular-nums text-slate-900">
                        {displayText(ct.phone)}
                      </span>
                      {ct.email ? (
                        <a
                          href={`mailto:${ct.email}`}
                          className="inline-flex items-center gap-1 hover:text-blue-700"
                        >
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{ct.email}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400">Email: Not seen</span>
                      )}
                    </div>

                    {ct.notes && <p className="text-xs text-slate-500 pt-0.5">{ct.notes}</p>}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {ct.cardImageDataUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxImage(ct.cardImageDataUrl!)}
                        className="group relative rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition-colors"
                        title="View scanned business card"
                      >
                        <img
                          src={ct.cardImageDataUrl}
                          alt={`${ct.fullName} business card`}
                          className="w-20 h-12 object-cover"
                        />
                        <span className="sr-only">View scanned card</span>
                      </button>
                    )}

                    {ct.phone && (
                      <>
                        <a
                          href={getTelUrl(ct.phone)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:border-blue-300 inline-flex items-center gap-1.5"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </a>
                        <a
                          href={getWhatsAppUrl(ct.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:text-emerald-700 hover:border-emerald-300 inline-flex items-center gap-1.5"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 3: FLEET & VEHICLES */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Fleet & Vehicles ({customer.vehicles.length})
              </h2>
              <p className="text-xs text-slate-500">
                Missing dates display &ldquo;Not seen&rdquo;; unquoted units display &ldquo;Ask for a quote&rdquo;.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingVehicle((v) => !v)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>{isAddingVehicle ? 'Close' : 'Add Vehicle'}</span>
            </button>
          </div>

          {isAddingVehicle && (
            <form
              onSubmit={handleAddVehicle}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Plate Number (e.g. GBJ1234X) *"
                  value={vehicleForm.plateNumber}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Brand (e.g. Isuzu, Hino, BYD)"
                  value={vehicleForm.brand}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Model (e.g. NPR 85U)"
                  value={vehicleForm.model}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Size (e.g. 10ft, 14ft, 24ft, EV Van)"
                  value={vehicleForm.size}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, size: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Reefer Brand (e.g. Thermo King)"
                  value={vehicleForm.reeferBrand}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, reeferBrand: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                />
                <input
                  type="number"
                  min={0}
                  max={30}
                  placeholder="Age (Years)"
                  value={vehicleForm.ageYears}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, ageYears: e.target.value })}
                  className="min-h-[42px] px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl"
                />
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    COE Expiry
                  </label>
                  <input
                    type="date"
                    value={vehicleForm.coeExpiry}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, coeExpiry: e.target.value })}
                    className="w-full min-h-[40px] px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Insurance Expiry
                  </label>
                  <input
                    type="date"
                    value={vehicleForm.insuranceExpiry}
                    onChange={(e) =>
                      setVehicleForm({ ...vehicleForm, insuranceExpiry: e.target.value })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    VPC Expiry
                  </label>
                  <input
                    type="date"
                    value={vehicleForm.vpcExpiry}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, vpcExpiry: e.target.value })}
                    className="w-full min-h-[40px] px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Servicing Due
                  </label>
                  <input
                    type="date"
                    value={vehicleForm.servicingDue}
                    onChange={(e) =>
                      setVehicleForm({ ...vehicleForm, servicingDue: e.target.value })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Quoted Price (leave blank to show &ldquo;Ask for a quote&rdquo;)
                  </label>
                  <input
                    type="text"
                    placeholder="Ask for a quote"
                    value={vehicleForm.quotedPrice}
                    onChange={(e) =>
                      setVehicleForm({ ...vehicleForm, quotedPrice: e.target.value })
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-1.5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Save Vehicle
                </button>
              </div>
            </form>
          )}

          {customer.vehicles.length === 0 ? (
            <p className="text-sm text-slate-500">No fleet vehicles logged yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-y border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-4">Plate & Spec</th>
                    <th className="py-2.5 px-3">Reefer & Age</th>
                    <th className="py-2.5 px-3">COE Expiry</th>
                    <th className="py-2.5 px-3">Insurance</th>
                    <th className="py-2.5 px-3">VPC Expiry</th>
                    <th className="py-2.5 px-3">Servicing Due</th>
                    <th className="py-2.5 px-4 text-right">Quote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {customer.vehicles.map((v) => (
                    <tr key={v.id} className="align-top">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900 tabular-nums">
                          {displayText(v.plateNumber)}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {displayText([v.brand, v.model].filter(Boolean).join(' '))} ·{' '}
                          {displayText(v.size)}
                        </div>
                        {v.notes && <div className="text-xs text-slate-500 mt-1">{v.notes}</div>}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="text-xs font-medium text-slate-800">
                          {displayText(v.reeferBrand)}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                          {v.ageYears !== null ? `${v.ageYears} yr${v.ageYears === 1 ? '' : 's'}` : 'Age: Not seen'}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">{renderExpiryCell(v.coeExpiry)}</td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {renderExpiryCell(v.insuranceExpiry)}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">{renderExpiryCell(v.vpcExpiry)}</td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {renderExpiryCell(v.servicingDue)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`text-xs font-mono tabular-nums ${
                            v.quotedPrice ? 'font-semibold text-slate-900' : 'text-slate-500 italic'
                          }`}
                        >
                          {displayQuote(v.quotedPrice)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* SECTION 4: FOLLOW-UP HISTORY TIMELINE */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Follow-Up History ({customerFollowUps.length})
              </h2>
              <p className="text-xs text-slate-500">
                Logged calls, depot visits, WhatsApp messages, and customer verbatim notes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenNewFollowUp({ customerId: customer.id, channel: 'Visit' })}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Follow-Up</span>
            </button>
          </div>

          {customerFollowUps.length === 0 ? (
            <p className="text-sm text-slate-500">No follow-ups logged for this account yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 border-t border-slate-100">
              {customerFollowUps.map((fu) => {
                const ct = customer.contacts.find((c) => c.id === fu.contactId);
                return (
                  <div key={fu.id} className="py-4 first:pt-2 last:pb-0 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2">
                        <span className="font-bold text-slate-900">{fu.channel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Next: {formatReadableDate(fu.nextStepDate)}
                        </span>
                        {ct && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{ct.fullName}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            fu.status === 'Done'
                              ? 'text-emerald-700 font-semibold'
                              : 'text-blue-700 font-semibold'
                          }
                        >
                          {fu.status}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleFollowUpDone(fu.id)}
                        className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 shrink-0"
                      >
                        {fu.status === 'Done' ? (
                          <>
                            <RotateCcw className="w-3 h-3" />
                            <span>Reopen</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Done</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="text-sm font-semibold text-slate-900">{fu.nextStep}</div>
                    {fu.exactCustomerWords && (
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {fu.exactCustomerWords}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Card Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25"
            aria-label="Close card preview"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="space-y-2 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <ImageIcon className="w-4 h-4" />
              <span>Original Scanned Business Card</span>
            </div>
            <img
              src={lightboxImage}
              alt="Scanned business card"
              className="w-full max-h-[80vh] rounded-xl object-contain bg-slate-900"
            />
          </div>
        </div>
      )}
    </div>
  );
};
