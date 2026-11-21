import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Database,
  Loader2,
  LogOut,
  Shield,
  Users,
} from 'lucide-react';
import {
  ActiveTab,
  AppState,
  AppUser,
  Customer,
  FollowUp,
  FollowUpChannel,
} from './types';
import { generateId, getTodayIso } from './utils/helpers';
import { CsvImportPreviewRow } from './utils/csv';
import { loadAppStateFromIDB, saveAppStateToIDB } from './utils/storage';
import { TodayView } from './components/TodayView';
import { SaveCardPayload, ScanCardView } from './components/ScanCardView';
import { CustomersView } from './components/CustomersView';
import { CustomerDetailView } from './components/CustomerDetailView';
import { DataView } from './components/DataView';
import { FollowUpModal } from './components/FollowUpModal';
import { AuthScreen } from './components/AuthScreen';
import { UserManagementView } from './components/UserManagementView';

export default function App() {
  const [state, setState] = useState<AppState>({
    users: [],
    currentUserId: null,
    customers: [],
    followUps: [],
    expiryActions: {},
  });
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Follow-up modal state
  const [followUpModalOpen, setFollowUpModalOpen] = useState<boolean>(false);
  const [followUpPrefill, setFollowUpPrefill] = useState<{
    customerId?: string;
    channel?: FollowUpChannel;
    nextStep?: string;
  }>({});

  // Initial load from IndexedDB
  useEffect(() => {
    let isMounted = true;
    loadAppStateFromIDB()
      .then((loadedState) => {
        if (isMounted) {
          setState(loadedState);
          setIsHydrating(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load initial state from IndexedDB:', err);
        if (isMounted) {
          setIsHydrating(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Save state to IndexedDB whenever state updates
  useEffect(() => {
    if (isHydrating) return;
    saveAppStateToIDB(state).catch(() => {
      setToastMessage('Browser storage is nearly full. Export a JSON backup in Data.');
    });
  }, [state, isHydrating]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(''), 3400);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const showToast = (msg: string) => setToastMessage(msg);

  const currentUser = state.users.find((u) => u.id === state.currentUserId) || null;

  // Data scoping for Employee vs Admin/Manager
  const visibleCustomers = React.useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Admin' || currentUser.role === 'Manager') {
      return state.customers;
    }
    // Employee: records owned by them or unassigned
    return state.customers.filter(
      (c) => !c.ownerUserId || c.ownerUserId === currentUser.id
    );
  }, [state.customers, currentUser]);

  const visibleFollowUps = React.useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Admin' || currentUser.role === 'Manager') {
      return state.followUps;
    }
    return state.followUps.filter(
      (f) => !f.ownerUserId || f.ownerUserId === currentUser.id
    );
  }, [state.followUps, currentUser]);

  const openCustomer360 = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setActiveTab('customers');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab !== 'customers') {
      setSelectedCustomerId(null);
    } else if (activeTab === 'customers') {
      setSelectedCustomerId(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoginSuccess = (userId: string) => {
    setState((prev) => ({ ...prev, currentUserId: userId }));
    showToast('Signed in successfully.');
  };

  const handleLogout = () => {
    setState((prev) => ({ ...prev, currentUserId: null }));
    setActiveTab('today');
    setSelectedCustomerId(null);
    showToast('Logged out.');
  };

  const handleRegisterUser = (newUser: AppUser) => {
    setState((prev) => ({
      ...prev,
      users: [...prev.users, newUser],
    }));
    showToast('Registration successful.');
  };

  const handleUpdatePassword = (userId: string, newPasswordHash: string) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, passwordHash: newPasswordHash } : u)),
    }));
    showToast('Password updated.');
  };

  const handleUpdateUser = (updatedUser: AppUser) => {
    if (currentUser?.role !== 'Admin') {
      showToast('Unauthorized: Admin access required.');
      return;
    }
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
    }));
  };

  const handleAdminCreateUser = (newUser: AppUser) => {
    if (currentUser?.role !== 'Admin') {
      showToast('Unauthorized: Admin access required.');
      return;
    }
    setState((prev) => ({
      ...prev,
      users: [...prev.users, newUser],
    }));
  };

  const handleAdminDeleteUser = (userId: string) => {
    if (currentUser?.role !== 'Admin') {
      showToast('Unauthorized: Admin access required.');
      return;
    }
    setState((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.id !== userId),
    }));
  };

  const handleAdminResetPassword = (userId: string, newHash: string) => {
    if (currentUser?.role !== 'Admin') {
      showToast('Unauthorized: Admin access required.');
      return;
    }
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, passwordHash: newHash } : u)),
    }));
  };

  const handleOpenNewFollowUp = (prefill?: {
    customerId?: string;
    channel?: FollowUpChannel;
    nextStep?: string;
  }) => {
    setFollowUpPrefill(prefill || {});
    setFollowUpModalOpen(true);
  };

  const handleSaveFollowUp = (fu: FollowUp) => {
    const ownerFu: FollowUp = {
      ...fu,
      ownerUserId: currentUser?.id,
    };
    setState((prev) => ({
      ...prev,
      followUps: [ownerFu, ...prev.followUps],
    }));
    showToast('Follow-up saved.');
  };

  const handleToggleFollowUpDone = (followUpId: string) => {
    const today = getTodayIso();
    setState((prev) => ({
      ...prev,
      followUps: prev.followUps.map((f) =>
        f.id === followUpId
          ? {
              ...f,
              status: f.status === 'Done' ? 'Pending' : 'Done',
              completedAt: f.status === 'Done' ? undefined : today,
            }
          : f
      ),
    }));
  };

  const handleSnoozeFollowUp = (followUpId: string, newDate: string) => {
    setState((prev) => ({
      ...prev,
      followUps: prev.followUps.map((f) =>
        f.id === followUpId ? { ...f, nextStepDate: newDate } : f
      ),
    }));
    showToast(`Rescheduled to ${newDate}.`);
  };

  const handleMarkExpiryDone = (expiryKey: string) => {
    const today = getTodayIso();
    setState((prev) => ({
      ...prev,
      expiryActions: {
        ...prev.expiryActions,
        [expiryKey]: {
          key: expiryKey,
          status: 'Done',
          updatedAt: today,
        },
      },
    }));
    showToast('Expiry reminder marked done.');
  };

  const handleSnoozeExpiry = (expiryKey: string, snoozedUntil: string) => {
    const today = getTodayIso();
    setState((prev) => ({
      ...prev,
      expiryActions: {
        ...prev.expiryActions,
        [expiryKey]: {
          key: expiryKey,
          status: 'Snoozed',
          snoozedUntil,
          updatedAt: today,
        },
      },
    }));
    showToast(`Reminder snoozed until ${snoozedUntil}.`);
  };

  const handleAddCustomer = (customer: Customer) => {
    const ownerCust: Customer = {
      ...customer,
      ownerUserId: currentUser?.id,
    };
    setState((prev) => ({
      ...prev,
      customers: [ownerCust, ...prev.customers],
    }));
    showToast(`Added ${customer.companyName}.`);
  };

  const handleUpdateCustomer = (updated: Customer) => {
    setState((prev) => ({
      ...prev,
      customers: prev.customers.map((c) => (c.id === updated.id ? updated : c)),
    }));
    showToast('Customer file updated.');
  };

  const handleSaveScannedCard = (payload: SaveCardPayload): string => {
    const today = getTodayIso();

    if (payload.mode === 'merge' && payload.existingCustomerId) {
      setState((prev) => ({
        ...prev,
        customers: prev.customers.map((c) => {
          if (c.id !== payload.existingCustomerId) return c;
          const updatedContacts = c.contacts.map((ct) => {
            if (ct.id !== payload.existingContactId) return ct;
            const mergedNotes = [ct.notes, payload.notes]
              .filter((s) => s && s.trim())
              .filter((v, idx, arr) => arr.indexOf(v) === idx)
              .join(' | ');
            return {
              ...ct,
              fullName: ct.fullName || payload.fullName,
              title: ct.title || payload.title,
              email: ct.email || payload.email,
              phone: ct.phone || payload.phone,
              cardImageDataUrl: payload.cardImageDataUrl || ct.cardImageDataUrl,
              sourceTag: ct.sourceTag || payload.sourceTag,
              isDecisionMaker: ct.isDecisionMaker || payload.isDecisionMaker,
              notes: mergedNotes,
            };
          });
          return {
            ...c,
            address: c.address || payload.address,
            area: c.area === 'Other' ? payload.area : c.area,
            contacts: updatedContacts,
            updatedAt: today,
          };
        }),
      }));
      showToast('Merged business card into existing contact.');
      return payload.existingCustomerId;
    }

    const normalizedCompany = payload.companyName.trim().toLowerCase();
    const existingByCompany = normalizedCompany
      ? state.customers.find(
          (c) => c.companyName.trim().toLowerCase() === normalizedCompany
        )
      : undefined;

    if (existingByCompany && payload.mode === 'new') {
      const newContactId = generateId('ct');
      setState((prev) => ({
        ...prev,
        customers: prev.customers.map((c) => {
          if (c.id !== existingByCompany.id) return c;
          return {
            ...c,
            address: c.address || payload.address,
            contacts: [
              ...c.contacts,
              {
                id: newContactId,
                fullName: payload.fullName || 'New Contact',
                title: payload.title,
                phone: payload.phone,
                email: payload.email,
                isDecisionMaker: payload.isDecisionMaker,
                cardImageDataUrl: payload.cardImageDataUrl,
                sourceTag: payload.sourceTag,
                notes: payload.notes,
                addedAt: today,
              },
            ],
            updatedAt: today,
          };
        }),
      }));
      showToast(`Added contact to ${existingByCompany.companyName}.`);
      return existingByCompany.id;
    }

    const newCustomerId = generateId('cust');
    const newCustomer: Customer = {
      id: newCustomerId,
      ownerUserId: currentUser?.id,
      companyName:
        payload.companyName || (payload.fullName ? `${payload.fullName} (Lead)` : 'New Prospect'),
      uen: '',
      address: payload.address,
      area: payload.area,
      industry: '',
      business: '',
      fleetSize: '',
      grade: payload.grade,
      status: 'New Lead',
      riskLight: 'Green',
      sourceTag: payload.sourceTag,
      tags: [payload.sourceTag],
      notes: payload.notes,
      contacts: [
        {
          id: generateId('ct'),
          fullName: payload.fullName || 'Primary Contact',
          title: payload.title,
          phone: payload.phone,
          email: payload.email,
          isDecisionMaker: payload.isDecisionMaker,
          cardImageDataUrl: payload.cardImageDataUrl,
          sourceTag: payload.sourceTag,
          notes: payload.notes,
          addedAt: today,
        },
      ],
      vehicles: [],
      createdAt: today,
      updatedAt: today,
    };

    setState((prev) => ({
      ...prev,
      customers: [newCustomer, ...prev.customers],
    }));
    showToast(`Saved ${newCustomer.companyName}.`);
    return newCustomerId;
  };

  const handleCommitCsvImport = (rows: CsvImportPreviewRow[]) => {
    const today = getTodayIso();
    let created = 0;
    let merged = 0;
    let skipped = 0;

    const nextCustomers = state.customers.map((c) => ({
      ...c,
      contacts: c.contacts.map((ct) => ({ ...ct })),
      tags: [...c.tags],
      vehicles: c.vehicles.map((v) => ({ ...v })),
    }));

    for (const row of rows) {
      if (row.action === 'skip') {
        skipped++;
        continue;
      }

      if (row.action === 'merge' && row.duplicateMatch) {
        const targetCust = nextCustomers.find(
          (c) => c.id === row.duplicateMatch!.customer.id
        );
        if (targetCust) {
          targetCust.uen = targetCust.uen || row.uen;
          targetCust.address = targetCust.address || row.address;
          targetCust.industry = targetCust.industry || row.industry;
          targetCust.business = targetCust.business || row.business;
          targetCust.fleetSize = targetCust.fleetSize || row.fleetSize;
          targetCust.updatedAt = today;
          const targetCt = targetCust.contacts.find(
            (ct) => ct.id === row.duplicateMatch!.contact.id
          );
          if (targetCt) {
            targetCt.fullName = targetCt.fullName || row.fullName;
            targetCt.title = targetCt.title || row.title;
            targetCt.email = targetCt.email || row.email;
            targetCt.notes = targetCt.notes || row.notes;
          }
          merged++;
          continue;
        }
      }

      const existingCompany = nextCustomers.find(
        (c) =>
          c.companyName.trim().toLowerCase() === row.companyName.trim().toLowerCase()
      );

      if (existingCompany) {
        if (row.fullName || row.phone || row.email) {
          const normNewName = (row.fullName || '').trim().toLowerCase();
          const normNewEmail = (row.email || '').trim().toLowerCase();
          const matchingContact = existingCompany.contacts.find((ct) => {
            const normExistingName = ct.fullName.trim().toLowerCase();
            const normExistingEmail = ct.email.trim().toLowerCase();
            if (normNewName && normExistingName && normNewName === normExistingName) {
              return true;
            }
            if (normNewEmail && normExistingEmail && normNewEmail === normExistingEmail) {
              return true;
            }
            return false;
          });

          if (matchingContact) {
            matchingContact.title = matchingContact.title || row.title;
            matchingContact.phone = matchingContact.phone || row.phone;
            matchingContact.email = matchingContact.email || row.email;
            matchingContact.notes = [matchingContact.notes, row.notes]
              .filter(Boolean)
              .join(' | ');
            if (row.isDecisionMaker) matchingContact.isDecisionMaker = true;
          } else {
            existingCompany.contacts.push({
              id: generateId('ct'),
              fullName: row.fullName || 'Imported Contact',
              title: row.title,
              phone: row.phone,
              email: row.email,
              isDecisionMaker: row.isDecisionMaker,
              sourceTag: row.sourceTag,
              notes: row.notes,
              addedAt: today,
            });
          }
        }
        existingCompany.updatedAt = today;
        created++;
      } else {
        nextCustomers.unshift({
          id: generateId('cust'),
          ownerUserId: currentUser?.id,
          companyName: row.companyName,
          uen: row.uen,
          address: row.address,
          area: row.area,
          industry: row.industry,
          business: row.business,
          fleetSize: row.fleetSize,
          grade: row.grade,
          status: row.status,
          riskLight: row.riskLight,
          sourceTag: row.sourceTag,
          tags: row.tags,
          notes: row.notes,
          contacts:
            row.fullName || row.phone || row.email
              ? [
                  {
                    id: generateId('ct'),
                    fullName: row.fullName || 'Primary Contact',
                    title: row.title,
                    phone: row.phone,
                    email: row.email,
                    isDecisionMaker: row.isDecisionMaker,
                    sourceTag: row.sourceTag,
                    notes: row.notes,
                    addedAt: today,
                  },
                ]
              : [],
          vehicles: [],
          createdAt: today,
          updatedAt: today,
        });
        created++;
      }
    }

    setState((prev) => ({ ...prev, customers: nextCustomers }));
    showToast(`CSV imported: ${created} added, ${merged} merged.`);
    return { created, merged, skipped };
  };

  const handleResetSampleData = () => {
    import('./data/seedData').then(({ createSeedState }) => {
      const seed = createSeedState();
      setState((prev) => ({
        ...prev,
        customers: seed.customers,
        followUps: seed.followUps,
        expiryActions: {},
      }));
      setSelectedCustomerId(null);
      showToast('Sample fleet CRM data restored.');
    });
  };

  if (isHydrating) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
          <p className="text-sm font-semibold text-slate-700">Loading Lewis Sales Assistant...</p>
        </div>
      </div>
    );
  }

  // If no user logged in, show AuthScreen
  if (!currentUser) {
    return (
      <AuthScreen
        users={state.users}
        onLoginSuccess={handleLoginSuccess}
        onRegisterUser={handleRegisterUser}
        onUpdatePassword={handleUpdatePassword}
      />
    );
  }

  const selectedCustomer = selectedCustomerId
    ? visibleCustomers.find((c) => c.id === selectedCustomerId) || null
    : null;

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    mobileLabel: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'today',
      label: 'Today',
      mobileLabel: 'Today',
      icon: <ClipboardList className="w-5 h-5" />,
    },
    {
      id: 'scan',
      label: 'Scan Card',
      mobileLabel: 'Scan',
      icon: <Camera className="w-5 h-5" />,
    },
    {
      id: 'customers',
      label: 'Customers',
      mobileLabel: 'Customers',
      icon: <Users className="w-5 h-5" />,
    },
    ...(currentUser.role === 'Admin'
      ? [
          {
            id: 'users' as ActiveTab,
            label: 'Users',
            mobileLabel: 'Users',
            icon: <Shield className="w-5 h-5" />,
          },
        ]
      : []),
    {
      id: 'data',
      label: 'Import & Export',
      mobileLabel: 'Data',
      icon: <Database className="w-5 h-5" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Desktop Top Bar (3-zone contract) + User Badge & Logout */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleTabChange('today')}
            className="text-base md:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Lewis Sales Assistant
          </button>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.id)}
                  className={`py-1 text-sm font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    isActive
                      ? 'text-blue-700 border-blue-700'
                      : 'text-slate-600 border-transparent hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: User Badge + Log Out + Scan CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
              <span className="font-bold text-slate-900">{currentUser.fullName}</span>
              <span className="text-slate-400">·</span>
              <span className="font-semibold text-blue-700">
                {currentUser.role}
                {currentUser.department ? ` (${currentUser.department})` : ''}
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:text-red-600 hover:border-red-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('scan')}
              className="min-h-[40px] px-3.5 md:px-4 py-2 rounded-xl bg-blue-700 text-white text-xs md:text-sm font-semibold hover:bg-blue-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Camera className="w-4 h-4" />
              <span>+ Scan Card</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Responsive Content Canvas */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-24 md:py-8">
        {activeTab === 'today' && (
          <TodayView
            customers={visibleCustomers}
            followUps={visibleFollowUps}
            expiryActions={state.expiryActions}
            onOpenScan={() => handleTabChange('scan')}
            onOpenCustomer={openCustomer360}
            onOpenNewFollowUp={handleOpenNewFollowUp}
            onToggleFollowUpDone={handleToggleFollowUpDone}
            onSnoozeFollowUp={handleSnoozeFollowUp}
            onMarkExpiryDone={handleMarkExpiryDone}
            onSnoozeExpiry={handleSnoozeExpiry}
          />
        )}

        {activeTab === 'scan' && (
          <ScanCardView
            customers={visibleCustomers}
            onSaveCard={handleSaveScannedCard}
            onOpenCustomer={openCustomer360}
          />
        )}

        {activeTab === 'customers' && !selectedCustomer && (
          <CustomersView
            customers={visibleCustomers}
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
            onAddCustomer={handleAddCustomer}
            onOpenNewFollowUp={handleOpenNewFollowUp}
          />
        )}

        {activeTab === 'customers' && selectedCustomer && (
          <CustomerDetailView
            customer={selectedCustomer}
            allCustomers={visibleCustomers}
            followUps={visibleFollowUps}
            onBack={() => setSelectedCustomerId(null)}
            onUpdateCustomer={handleUpdateCustomer}
            onOpenNewFollowUp={handleOpenNewFollowUp}
            onToggleFollowUpDone={handleToggleFollowUpDone}
          />
        )}

        {activeTab === 'users' && currentUser.role === 'Admin' && (
          <UserManagementView
            currentUser={currentUser}
            users={state.users}
            onUpdateUser={handleUpdateUser}
            onCreateUser={handleAdminCreateUser}
            onDeleteUser={handleAdminDeleteUser}
            onResetPassword={handleAdminResetPassword}
            showToast={showToast}
          />
        )}

        {activeTab === 'data' && (
          <DataView
            state={{ ...state, customers: visibleCustomers, followUps: visibleFollowUps }}
            onCommitCsvImport={handleCommitCsvImport}
            onResetSampleData={handleResetSampleData}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
        aria-label="Mobile bottom navigation"
      >
        <div className={`grid grid-cols-${navItems.length} h-16`}>
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={`flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors ${
                  isActive ? 'text-blue-700 font-bold' : 'text-slate-500 font-medium'
                }`}
              >
                {item.icon}
                <span className="text-[11px] leading-none whitespace-nowrap">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Log Follow-Up Modal */}
      <FollowUpModal
        isOpen={followUpModalOpen}
        customers={visibleCustomers}
        initialCustomerId={followUpPrefill.customerId}
        initialChannel={followUpPrefill.channel}
        initialNextStep={followUpPrefill.nextStep}
        onClose={() => setFollowUpModalOpen(false)}
        onSave={handleSaveFollowUp}
      />

      {/* Non-intrusive Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:max-w-sm z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-sm font-medium"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
