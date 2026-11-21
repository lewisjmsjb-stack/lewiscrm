import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Truck,
  X,
} from 'lucide-react';
import {
  AREAS,
  AreaZone,
  Customer,
  CustomerGrade,
  CustomerStatus,
  ExpiryUrgency,
  FollowUpChannel,
  GRADES,
  RISK_LIGHTS,
  RiskLight,
  SOURCE_TAGS,
  SourceTag,
  STATUSES,
} from '../types';
import {
  buildVehicleExpiryItems,
  displayText,
  formatReadableDate,
  formatRelativeDue,
  generateId,
  getTelUrl,
  getTodayIso,
  getWhatsAppUrl,
} from '../utils/helpers';

interface CustomersViewProps {
  customers: Customer[];
  onSelectCustomer: (customerId: string) => void;
  onAddCustomer: (customer: Customer) => void;
  onOpenNewFollowUp: (prefill?: {
    customerId?: string;
    channel?: FollowUpChannel;
    nextStep?: string;
  }) => void;
}

type SubViewMode = 'list' | 'area' | 'timeline';

function RiskIndicator({ risk }: { risk: RiskLight }) {
  const styles =
    risk === 'Red'
      ? { dot: 'bg-red-600', text: 'text-red-700' }
      : risk === 'Yellow'
        ? { dot: 'bg-amber-500', text: 'text-amber-800' }
        : { dot: 'bg-emerald-600', text: 'text-emerald-800' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${styles.text}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`} aria-hidden="true" />
      <span>Risk: {risk}</span>
    </span>
  );
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  onSelectCustomer,
  onAddCustomer,
  onOpenNewFollowUp,
}) => {
  const today = getTodayIso();
  const [viewMode, setViewMode] = useState<SubViewMode>('list');
  const [search, setSearch] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<CustomerGrade | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | 'All'>('All');
  const [areaFilter, setAreaFilter] = useState<AreaZone | 'All'>('All');
  const [urgencyFilter, setUrgencyFilter] = useState<ExpiryUrgency | 'All'>('All');

  // Add Customer Modal state
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [newCompany, setNewCompany] = useState<string>('');
  const [newUen, setNewUen] = useState<string>('');
  const [newArea, setNewArea] = useState<AreaZone>('Jurong');
  const [newAddress, setNewAddress] = useState<string>('');
  const [newIndustry, setNewIndustry] = useState<string>('');
  const [newBusiness, setNewBusiness] = useState<string>('');
  const [newFleetSize, setNewFleetSize] = useState<string>('');
  const [newGrade, setNewGrade] = useState<CustomerGrade>('B');
  const [newStatus, setNewStatus] = useState<CustomerStatus>('New Lead');
  const [newRisk, setNewRisk] = useState<RiskLight>('Green');
  const [newSource, setNewSource] = useState<SourceTag>('Visit');
  const [newContactName, setNewContactName] = useState<string>('');
  const [newContactTitle, setNewContactTitle] = useState<string>('');
  const [newContactPhone, setNewContactPhone] = useState<string>('');
  const [newContactEmail, setNewContactEmail] = useState<string>('');

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (gradeFilter !== 'All' && c.grade !== gradeFilter) return false;
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (areaFilter !== 'All' && c.area !== areaFilter) return false;
      if (!q) return true;
      const haystack = [
        c.companyName,
        c.uen,
        c.area,
        c.address,
        c.industry,
        c.business,
        ...c.tags,
        ...c.contacts.flatMap((ct) => [ct.fullName, ct.phone, ct.email, ct.title]),
        ...c.vehicles.flatMap((v) => [v.plateNumber, v.brand, v.model, v.reeferBrand]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [customers, search, gradeFilter, statusFilter, areaFilter]);

  const customersByArea = useMemo(() => {
    const groups = new Map<AreaZone, Customer[]>();
    for (const area of AREAS) {
      const list = filteredCustomers.filter((c) => c.area === area);
      if (list.length > 0) groups.set(area, list);
    }
    return Array.from(groups.entries());
  }, [filteredCustomers]);

  const timelineItems = useMemo(() => {
    const all = buildVehicleExpiryItems(filteredCustomers, today);
    if (urgencyFilter === 'All') return all;
    return all.filter((item) => item.urgency === urgencyFilter);
  }, [filteredCustomers, today, urgencyFilter]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    gradeFilter !== 'All' ||
    statusFilter !== 'All' ||
    areaFilter !== 'All';

  const resetFilters = () => {
    setSearch('');
    setGradeFilter('All');
    setStatusFilter('All');
    setAreaFilter('All');
    setUrgencyFilter('All');
  };

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.trim()) return;

    const customer: Customer = {
      id: generateId('cust'),
      companyName: newCompany.trim(),
      uen: newUen.trim(),
      address: newAddress.trim(),
      area: newArea,
      industry: newIndustry.trim(),
      business: newBusiness.trim(),
      fleetSize: newFleetSize.trim(),
      grade: newGrade,
      status: newStatus,
      riskLight: newRisk,
      sourceTag: newSource,
      tags: [],
      notes: '',
      contacts: newContactName.trim() || newContactPhone.trim()
        ? [
            {
              id: generateId('ct'),
              fullName: newContactName.trim() || 'Primary Contact',
              title: newContactTitle.trim(),
              phone: newContactPhone.trim(),
              email: newContactEmail.trim(),
              isDecisionMaker: true,
              sourceTag: newSource,
              notes: '',
              addedAt: today,
            },
          ]
        : [],
      vehicles: [],
      createdAt: today,
      updatedAt: today,
    };

    onAddCustomer(customer);
    setIsAddOpen(false);
    setNewCompany('');
    setNewUen('');
    setNewAddress('');
    setNewIndustry('');
    setNewBusiness('');
    setNewFleetSize('');
    setNewContactName('');
    setNewContactTitle('');
    setNewContactPhone('');
    setNewContactEmail('');
    onSelectCustomer(customer.id);
  };

  const urgencyBadgeTextClass = (urgency: ExpiryUrgency) => {
    if (urgency === 'Overdue') return 'text-red-700 font-bold';
    if (urgency === '<=7 days') return 'text-red-700 font-semibold';
    if (urgency === '<=14 days') return 'text-amber-700 font-semibold';
    if (urgency === '<=30 days') return 'text-blue-700 font-semibold';
    return 'text-slate-600 font-medium';
  };

  return (
    <div className="space-y-5">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500 font-mono tabular-nums">
            {customers.length} accounts ·{' '}
            {customers.reduce((acc, c) => acc + c.vehicles.length, 0)} tracked vehicles
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mt-1">
            Customer Files & Fleet
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented View Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-xl">
            {(
              [
                { id: 'list', label: 'All Customers' },
                { id: 'area', label: 'Area View' },
                { id: 'timeline', label: 'Vehicle Timeline' },
              ] as Array<{ id: SubViewMode; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  viewMode === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
        <div className="sm:col-span-2 lg:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, contact, phone, plate number..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="lg:col-span-2">
          <select
            aria-label="Filter by grade"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value as CustomerGrade | 'All')}
            className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900"
          >
            <option value="All">All Grades</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-3">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CustomerStatus | 'All')}
            className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900"
          >
            <option value="All">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <select
            aria-label="Filter by area"
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value as AreaZone | 'All')}
            className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900"
          >
            <option value="All">All Areas</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            Showing <strong className="font-mono tabular-nums text-slate-900">{filteredCustomers.length}</strong> of{' '}
            <strong className="font-mono tabular-nums text-slate-900">{customers.length}</strong> accounts
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="font-semibold text-blue-700 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* VIEW 1: ALL CUSTOMERS */}
      {viewMode === 'list' && (
        <>
          {filteredCustomers.length === 0 ? (
            <div className="p-10 bg-white border border-slate-200 rounded-2xl text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900">No matching customers found.</p>
              <p className="text-xs text-slate-500">
                Try adjusting your grade, status, or area filters, or add a new account.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
              {filteredCustomers.map((c) => {
                const dm = c.contacts.find((ct) => ct.isDecisionMaker) || c.contacts[0];
                return (
                  <div
                    key={c.id}
                    className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectCustomer(c.id)}
                      className="text-left flex-1 min-w-0 space-y-1.5"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-slate-900 hover:text-blue-700">
                          {c.companyName}
                        </h2>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
                        <span className="font-bold text-slate-900">Grade {c.grade}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-blue-800">{c.status}</span>
                        <span aria-hidden="true">·</span>
                        <span>{c.area}</span>
                        <span aria-hidden="true">·</span>
                        <RiskIndicator risk={c.riskLight} />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>
                          Contact: <strong className="font-medium text-slate-800">{displayText(dm?.fullName)}</strong>
                          {dm?.title ? ` (${dm.title})` : ''}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {c.vehicles.length} vehicle{c.vehicles.length === 1 ? '' : 's'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{displayText(c.industry)}</span>
                      </div>
                    </button>

                    {/* Quick Field Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {dm?.phone && (
                        <>
                          <a
                            href={getTelUrl(dm.phone)}
                            className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-blue-700 hover:border-blue-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call</span>
                          </a>
                          <a
                            href={getWhatsAppUrl(dm.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-emerald-700 hover:border-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectCustomer(c.id)}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
                      >
                        Open 360°
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* VIEW 2: AREA VIEW (ROUTE PLANNING) */}
      {viewMode === 'area' && (
        <div className="space-y-5">
          {customersByArea.length === 0 ? (
            <div className="p-10 bg-white border border-slate-200 rounded-2xl text-center text-sm text-slate-600">
              No accounts match the active filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {customersByArea.map(([area, areaCustomers]) => {
                const totalVehicles = areaCustomers.reduce((sum, c) => sum + c.vehicles.length, 0);
                return (
                  <section
                    key={area}
                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
                  >
                    <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-700" />
                        <h2 className="text-base font-bold text-slate-900">{area}</h2>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-slate-600">
                        {areaCustomers.length} stop{areaCustomers.length === 1 ? '' : 's'} ·{' '}
                        {totalVehicles} vehicle{totalVehicles === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-200">
                      {areaCustomers.map((c) => {
                        const dm = c.contacts.find((ct) => ct.isDecisionMaker) || c.contacts[0];
                        return (
                          <div key={c.id} className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => onSelectCustomer(c.id)}
                                className="text-left group"
                              >
                                <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700 inline-flex items-center gap-1">
                                  <span>{c.companyName}</span>
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {displayText(c.address)}
                                </p>
                              </button>
                              <span className="text-xs font-bold text-slate-800 shrink-0">
                                Grade {c.grade}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-blue-800">{c.status}</span>
                                <span aria-hidden="true">·</span>
                                <RiskIndicator risk={c.riskLight} />
                              </div>

                              <div className="flex items-center gap-2">
                                {dm?.phone && (
                                  <a
                                    href={getTelUrl(dm.phone)}
                                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:text-blue-700 inline-flex items-center gap-1"
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>{dm.fullName.split(' ')[0]}</span>
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenNewFollowUp({
                                      customerId: c.id,
                                      channel: 'Visit',
                                      nextStep: `Depot visit at ${c.companyName} (${c.area})`,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-xs font-semibold text-slate-800"
                                >
                                  + Log Visit
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: VEHICLE TIMELINE */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          {/* Urgency Filter Segmented Buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto">
            {(
              ['All', 'Overdue', '<=7 days', '<=14 days', '<=30 days', 'Scheduled'] as Array<
                ExpiryUrgency | 'All'
              >
            ).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUrgencyFilter(u)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  urgencyFilter === u
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          {timelineItems.length === 0 ? (
            <div className="p-10 bg-white border border-slate-200 rounded-2xl text-center text-sm text-slate-600">
              No vehicle expiry milestones match this filter.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Urgency</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Plate & Vehicle</th>
                      <th className="py-3 px-4">Expiry Type</th>
                      <th className="py-3 px-4">Customer & Area</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {timelineItems.map((item) => (
                      <tr key={item.key} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`text-xs ${urgencyBadgeTextClass(item.urgency)}`}>
                            {item.urgency}
                          </span>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {formatRelativeDue(item.daysDiff)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {formatReadableDate(item.dueDate)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-slate-900 tabular-nums">
                            {item.plateNumber}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Truck className="w-3 h-3 shrink-0" />
                            <span>
                              {item.vehicleSummary} · {item.reeferBrand}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-bold text-slate-800 whitespace-nowrap">
                          {item.expiryType}
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => onSelectCustomer(item.customerId)}
                            className="text-sm font-semibold text-slate-900 hover:text-blue-700 text-left"
                          >
                            {item.companyName}
                          </button>
                          <div className="text-xs text-slate-500">
                            {item.area} · Grade {item.grade}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenNewFollowUp({
                                customerId: item.customerId,
                                channel: 'WhatsApp',
                                nextStep: `Follow up on ${item.plateNumber} ${item.expiryType} expiry (${formatReadableDate(item.dueDate)})`,
                              })
                            }
                            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50/60 text-blue-800 hover:bg-blue-100 text-xs font-semibold"
                          >
                            + Follow-Up
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Customer Modal */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/55 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-white rounded-t-3xl md:rounded-2xl max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">New Customer Account</h2>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              id="add-customer-form"
              onSubmit={handleCreateCustomer}
              className="overflow-y-auto px-5 py-5 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="e.g., Jurong Cold Chain Express Pte Ltd"
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">UEN</label>
                  <input
                    type="text"
                    value={newUen}
                    onChange={(e) => setNewUen(e.target.value)}
                    placeholder="Leave blank if not seen"
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Area</label>
                  <select
                    value={newArea}
                    onChange={(e) => setNewArea(e.target.value as AreaZone)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Warehouse or depot address"
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Industry</label>
                  <input
                    type="text"
                    value={newIndustry}
                    onChange={(e) => setNewIndustry(e.target.value)}
                    placeholder="e.g., Cold-Chain Logistics"
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fleet Size</label>
                  <input
                    type="text"
                    value={newFleetSize}
                    onChange={(e) => setNewFleetSize(e.target.value)}
                    placeholder="e.g., 8 chiller trucks"
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Core Business</label>
                  <input
                    type="text"
                    value={newBusiness}
                    onChange={(e) => setNewBusiness(e.target.value)}
                    placeholder="What goods or routes do they run?"
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Grade</label>
                  <select
                    value={newGrade}
                    onChange={(e) => setNewGrade(e.target.value as CustomerGrade)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        Grade {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as CustomerStatus)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Risk Light</label>
                  <select
                    value={newRisk}
                    onChange={(e) => setNewRisk(e.target.value as RiskLight)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    {RISK_LIGHTS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Source Tag</label>
                  <select
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value as SourceTag)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    {SOURCE_TAGS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 mb-3">Primary Decision Maker (Optional)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Full name"
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                  <input
                    type="text"
                    value={newContactTitle}
                    onChange={(e) => setNewContactTitle(e.target.value)}
                    placeholder="Title (e.g., Operations Director)"
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                  <input
                    type="tel"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                  <input
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
            </form>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="add-customer-form"
                className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
              >
                Create Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
