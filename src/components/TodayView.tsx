import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Camera,
  Check,
  ChevronRight,
  Clock,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Truck,
} from 'lucide-react';
import {
  Customer,
  ExpiryTaskAction,
  FollowUp,
  FollowUpChannel,
  VehicleExpiryItem,
} from '../types';
import {
  addDaysIso,
  buildVehicleExpiryItems,
  diffDaysFromToday,
  displayText,
  formatReadableDate,
  formatRelativeDue,
  formatTodayBanner,
  getTelUrl,
  getTodayIso,
  getWhatsAppUrl,
  isExpiryReminderActive,
} from '../utils/helpers';

interface TodayViewProps {
  customers: Customer[];
  followUps: FollowUp[];
  expiryActions: Record<string, ExpiryTaskAction>;
  onOpenScan: () => void;
  onOpenCustomer: (customerId: string) => void;
  onOpenNewFollowUp: (prefill?: {
    customerId?: string;
    channel?: FollowUpChannel;
    nextStep?: string;
  }) => void;
  onToggleFollowUpDone: (followUpId: string) => void;
  onSnoozeFollowUp: (followUpId: string, newDate: string) => void;
  onMarkExpiryDone: (expiryKey: string) => void;
  onSnoozeExpiry: (expiryKey: string, snoozedUntil: string) => void;
}

type TodayFilter = 'all' | 'followups' | 'expiries' | 'overdue' | 'done';

export const TodayView: React.FC<TodayViewProps> = ({
  customers,
  followUps,
  expiryActions,
  onOpenScan,
  onOpenCustomer,
  onOpenNewFollowUp,
  onToggleFollowUpDone,
  onSnoozeFollowUp,
  onMarkExpiryDone,
  onSnoozeExpiry,
}) => {
  const today = getTodayIso();
  const [filter, setFilter] = useState<TodayFilter>('all');
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [customSnoozeDate, setCustomSnoozeDate] = useState<string>(addDaysIso(today, 2));

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers) map.set(c.id, c);
    return map;
  }, [customers]);

  const pendingFollowUps = useMemo(() => {
    return followUps
      .filter((f) => f.status === 'Pending')
      .sort((a, b) => a.nextStepDate.localeCompare(b.nextStepDate));
  }, [followUps]);

  const completedFollowUps = useMemo(() => {
    return followUps
      .filter((f) => f.status === 'Done')
      .sort((a, b) => (b.completedAt || b.nextStepDate).localeCompare(a.completedAt || a.nextStepDate));
  }, [followUps]);

  const activeExpiries = useMemo(() => {
    return buildVehicleExpiryItems(customers, today).filter((item) =>
      isExpiryReminderActive(item, expiryActions, today)
    );
  }, [customers, expiryActions, today]);

  const todayFollowUpsCount = pendingFollowUps.filter((f) => f.nextStepDate === today).length;
  const overdueFollowUpsCount = pendingFollowUps.filter((f) => f.nextStepDate < today).length;
  const overdueExpiriesCount = activeExpiries.filter((e) => e.daysDiff < 0).length;
  const totalOverdueCount = overdueFollowUpsCount + overdueExpiriesCount;
  const upcomingExpiriesCount = activeExpiries.length;

  const visibleFollowUps = useMemo(() => {
    if (filter === 'done') return completedFollowUps;
    if (filter === 'expiries') return [];
    if (filter === 'overdue') {
      return pendingFollowUps.filter((f) => f.nextStepDate < today);
    }
    return pendingFollowUps;
  }, [filter, pendingFollowUps, completedFollowUps, today]);

  const visibleExpiries = useMemo(() => {
    if (filter === 'done' || filter === 'followups') return [];
    if (filter === 'overdue') {
      return activeExpiries.filter((e) => e.daysDiff < 0);
    }
    return activeExpiries;
  }, [filter, activeExpiries]);

  const urgencyTextColor = (urgency: VehicleExpiryItem['urgency']) => {
    if (urgency === 'Overdue') return 'text-red-700 font-bold';
    if (urgency === '<=7 days') return 'text-red-700 font-semibold';
    if (urgency === '<=14 days') return 'text-amber-700 font-semibold';
    return 'text-blue-700 font-medium';
  };

  return (
    <div className="space-y-6">
      {/* Top Hero / Date & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">{formatTodayBanner()}</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mt-1">
            Today&apos;s Field Agenda
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenNewFollowUp()}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm font-semibold hover:bg-slate-100 flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Log Follow-Up</span>
          </button>
          <button
            type="button"
            onClick={onOpenScan}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Camera className="w-4 h-4" />
            <span>+ Scan Card</span>
          </button>
        </div>
      </div>

      {/* Summary Counters — Clean flat elevation with tabular figures */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setFilter('followups')}
          className={`text-left p-4 rounded-2xl border transition-colors ${
            filter === 'followups'
              ? 'bg-blue-50/70 border-blue-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-medium text-slate-600">Today&apos;s Follow-Ups</div>
          <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {todayFollowUpsCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {pendingFollowUps.length} open total
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter('overdue')}
          className={`text-left p-4 rounded-2xl border transition-colors ${
            filter === 'overdue'
              ? 'bg-red-50/80 border-red-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-medium text-slate-600">Overdue</div>
          <div
            className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums mt-1 ${
              totalOverdueCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {totalOverdueCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {overdueFollowUpsCount} tasks · {overdueExpiriesCount} fleet
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter('expiries')}
          className={`text-left p-4 rounded-2xl border transition-colors ${
            filter === 'expiries'
              ? 'bg-amber-50/80 border-amber-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-medium text-slate-600">Upcoming Expiries</div>
          <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {upcomingExpiriesCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">COE · Ins · VPC · Svc</div>
        </button>
      </div>

      {/* Segmented Filter Control */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto">
        {(
          [
            { id: 'all', label: `All Open (${pendingFollowUps.length + activeExpiries.length})` },
            { id: 'followups', label: `Follow-Ups (${pendingFollowUps.length})` },
            { id: 'expiries', label: `Vehicle Expiries (${activeExpiries.length})` },
            { id: 'overdue', label: `Overdue (${totalOverdueCount})` },
            { id: 'done', label: `Completed (${completedFollowUps.length})` },
          ] as Array<{ id: TodayFilter; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              filter === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Responsive Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Follow-Up Tasks Column */}
        {filter !== 'expiries' && (
          <section
            className={filter === 'all' || filter === 'overdue' ? 'lg:col-span-7 space-y-3' : 'lg:col-span-12 space-y-3'}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {filter === 'done' ? 'Completed Follow-Ups' : 'Actionable Follow-Ups'}
              </h2>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {visibleFollowUps.length} item{visibleFollowUps.length === 1 ? '' : 's'}
              </span>
            </div>

            {visibleFollowUps.length === 0 ? (
              <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  {filter === 'done'
                    ? 'No completed follow-ups yet.'
                    : filter === 'overdue'
                      ? 'All caught up — zero overdue follow-ups.'
                      : 'No open follow-ups scheduled.'}
                </p>
                <p className="text-xs text-slate-500">
                  Log a call, depot visit, or WhatsApp voice note to schedule your next customer touchpoint.
                </p>
                {filter !== 'done' && (
                  <button
                    type="button"
                    onClick={() => onOpenNewFollowUp()}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Log First Follow-Up</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
                {visibleFollowUps.map((fu) => {
                  const customer = customerMap.get(fu.customerId);
                  const contact =
                    customer?.contacts.find((ct) => ct.id === fu.contactId) ||
                    customer?.contacts.find((ct) => ct.isDecisionMaker) ||
                    customer?.contacts[0];
                  const daysDiff = diffDaysFromToday(fu.nextStepDate, today);
                  const isOverdue = fu.status === 'Pending' && daysDiff !== null && daysDiff < 0;
                  const isToday = fu.status === 'Pending' && daysDiff === 0;
                  const isSnoozing = snoozeTargetId === fu.id;

                  return (
                    <div key={fu.id} className="p-4 sm:p-5 space-y-3">
                      {/* Header Row: Title + Clean Unboxed Metadata */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => customer && onOpenCustomer(customer.id)}
                            className="text-left group inline-flex items-center gap-1.5"
                          >
                            <span className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                              {customer ? customer.companyName : 'Unknown Account'}
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-700 shrink-0" />
                          </button>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 mt-1">
                            <span className="font-semibold text-slate-800">{fu.channel}</span>
                            <span aria-hidden="true">·</span>
                            <span>{customer ? customer.area : 'Not seen'}</span>
                            <span aria-hidden="true">·</span>
                            <span>Grade {customer?.grade || 'Not seen'}</span>
                            {contact && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{contact.fullName}</span>
                              </>
                            )}
                            {fu.sourceAudioNote && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-blue-700 font-medium">Voice note</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Date & Urgency (Text + Icon, never hue-only) */}
                        <div className="text-right shrink-0">
                          <div
                            className={`text-xs font-semibold whitespace-nowrap ${
                              fu.status === 'Done'
                                ? 'text-emerald-700'
                                : isOverdue
                                  ? 'text-red-700'
                                  : isToday
                                    ? 'text-blue-700'
                                    : 'text-slate-600'
                            }`}
                          >
                            {fu.status === 'Done'
                              ? 'Completed'
                              : formatRelativeDue(daysDiff)}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                            {formatReadableDate(fu.nextStepDate)}
                          </div>
                        </div>
                      </div>

                      {/* Next Step */}
                      <div className="text-sm font-semibold text-slate-900 leading-snug">
                        Next step: {fu.nextStep}
                      </div>

                      {/* Exact Customer Words */}
                      {fu.exactCustomerWords && (
                        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-200/80">
                          {fu.exactCustomerWords}
                        </p>
                      )}

                      {/* Action Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleFollowUpDone(fu.id)}
                            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                              fu.status === 'Done'
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                : 'bg-emerald-700 text-white hover:bg-emerald-800'
                            }`}
                          >
                            {fu.status === 'Done' ? (
                              <>
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Reopen</span>
                              </>
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Mark Done</span>
                              </>
                            )}
                          </button>

                          {fu.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSnoozeTargetId(isSnoozing ? null : fu.id);
                                setCustomSnoozeDate(addDaysIso(today, 2));
                              }}
                              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Snooze</span>
                            </button>
                          )}
                        </div>

                        {/* Quick Outreach Links */}
                        {contact?.phone && (
                          <div className="flex items-center gap-2">
                            <a
                              href={getTelUrl(contact.phone)}
                              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:text-blue-700 hover:border-blue-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call</span>
                            </a>
                            <a
                              href={getWhatsAppUrl(contact.phone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:text-emerald-700 hover:border-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Inline Snooze Picker */}
                      {isSnoozing && (
                        <div className="pt-3 mt-1 border-t border-slate-200 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-slate-600">Reschedule to:</span>
                          {[
                            { label: 'Tomorrow', date: addDaysIso(today, 1) },
                            { label: '+3 days', date: addDaysIso(today, 3) },
                            { label: '+7 days', date: addDaysIso(today, 7) },
                          ].map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => {
                                onSnoozeFollowUp(fu.id, opt.date);
                                setSnoozeTargetId(null);
                              }}
                              className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-xs font-semibold text-slate-800 whitespace-nowrap"
                            >
                              {opt.label}
                            </button>
                          ))}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="date"
                              value={customSnoozeDate}
                              onChange={(e) => setCustomSnoozeDate(e.target.value)}
                              className="min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums border border-slate-300 rounded-lg bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (customSnoozeDate) {
                                  onSnoozeFollowUp(fu.id, customSnoozeDate);
                                  setSnoozeTargetId(null);
                                }
                              }}
                              className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold whitespace-nowrap"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Vehicle Expiry Reminders Column */}
        {filter !== 'followups' && filter !== 'done' && (
          <section
            className={filter === 'all' || filter === 'overdue' ? 'lg:col-span-5 space-y-3' : 'lg:col-span-12 space-y-3'}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Fleet Expiry Alerts (≤30 days)
              </h2>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {visibleExpiries.length} alert{visibleExpiries.length === 1 ? '' : 's'}
              </span>
            </div>

            {visibleExpiries.length === 0 ? (
              <div className="p-6 bg-white border border-slate-200 rounded-2xl text-center space-y-1.5">
                <p className="text-sm font-semibold text-slate-900">
                  No urgent vehicle expiries in this view.
                </p>
                <p className="text-xs text-slate-500">
                  COE, insurance, VPC, and servicing dates within 30 days appear here automatically.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
                {visibleExpiries.map((item) => {
                  const isSnoozing = snoozeTargetId === item.key;
                  return (
                    <div key={item.key} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                              {item.plateNumber}
                            </span>
                            <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                            <span className="text-xs font-bold text-slate-800">
                              {item.expiryType}
                            </span>
                            <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                            <span className={`text-xs ${urgencyTextColor(item.urgency)}`}>
                              {item.urgency}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenCustomer(item.customerId)}
                            className="text-sm font-semibold text-slate-800 hover:text-blue-700 mt-1 text-left flex items-center gap-1"
                          >
                            <span className="truncate">{item.companyName}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </button>

                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 mt-0.5">
                            <span className="inline-flex items-center gap-1">
                              <Truck className="w-3 h-3" />
                              {displayText(item.vehicleSummary)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {item.area}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-mono tabular-nums font-semibold text-slate-900">
                            {formatReadableDate(item.dueDate)}
                          </div>
                          <div className={`text-xs mt-0.5 ${urgencyTextColor(item.urgency)}`}>
                            {formatRelativeDue(item.daysDiff)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onMarkExpiryDone(item.key)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Done</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSnoozeTargetId(isSnoozing ? null : item.key)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          <span>Snooze</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenNewFollowUp({
                              customerId: item.customerId,
                              channel: 'WhatsApp',
                              nextStep: `Follow up on ${item.plateNumber} ${item.expiryType} due ${formatReadableDate(item.dueDate)}`,
                            })
                          }
                          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/70 text-blue-800 hover:bg-blue-100 text-xs font-semibold whitespace-nowrap"
                        >
                          + Follow-Up
                        </button>
                      </div>

                      {isSnoozing && (
                        <div className="pt-2.5 border-t border-slate-200 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-600">Hide reminder for:</span>
                          {[
                            { label: '1 day', days: 1 },
                            { label: '3 days', days: 3 },
                            { label: '7 days', days: 7 },
                          ].map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => {
                                onSnoozeExpiry(item.key, addDaysIso(today, opt.days));
                                setSnoozeTargetId(null);
                              }}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-xs font-semibold text-slate-800"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
