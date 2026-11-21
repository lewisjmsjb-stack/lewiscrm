import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Images,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  AREAS,
  AreaZone,
  Customer,
  CustomerGrade,
  GRADES,
  OcrCardResult,
  SOURCE_TAGS,
  SourceTag,
} from '../types';
import {
  compressImageFile,
  findContactByPhone,
  generateId,
  inferAreaFromAddress,
  normalizePhone,
} from '../utils/helpers';
import { extractBusinessCardOcr } from '../services/geminiClient';

export interface SaveCardPayload {
  mode: 'merge' | 'new';
  existingCustomerId?: string;
  existingContactId?: string;
  fullName: string;
  companyName: string;
  title: string;
  phone: string;
  email: string;
  address: string;
  area: AreaZone;
  notes: string;
  sourceTag: SourceTag;
  grade: CustomerGrade;
  isDecisionMaker: boolean;
  cardImageDataUrl: string;
}

interface ScanCardViewProps {
  customers: Customer[];
  onSaveCard: (payload: SaveCardPayload) => string; // returns customerId
  onOpenCustomer: (customerId: string) => void;
}

interface QueueCardItem {
  id: string;
  fileName: string;
  imageDataUrl: string;
  status: 'queued' | 'scanning' | 'ready' | 'saved' | 'error';
  errorMessage?: string;
  savedCustomerId?: string;
  fields: OcrCardResult;
  sourceTag: SourceTag;
  grade: CustomerGrade;
  area: AreaZone;
  isDecisionMaker: boolean;
}

const EMPTY_OCR: OcrCardResult = {
  fullName: '',
  companyName: '',
  title: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

export const ScanCardView: React.FC<ScanCardViewProps> = ({
  customers,
  onSaveCard,
  onOpenCustomer,
}) => {
  const [queue, setQueue] = useState<QueueCardItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isBatchScanning, setIsBatchScanning] = useState<boolean>(false);
  const [defaultSourceTag, setDefaultSourceTag] = useState<SourceTag>('Visit');
  const [defaultGrade, setDefaultGrade] = useState<CustomerGrade>('B');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCard = useMemo(
    () => queue.find((item) => item.id === selectedId) || queue[0] || null,
    [queue, selectedId]
  );

  const duplicateMatch = useMemo(() => {
    if (!selectedCard || selectedCard.status === 'saved') return null;
    return findContactByPhone(customers, selectedCard.fields.phone);
  }, [customers, selectedCard]);

  const queuedCount = queue.filter((q) => q.status === 'queued' || q.status === 'error').length;
  const readyCount = queue.filter((q) => q.status === 'ready').length;
  const savedCount = queue.filter((q) => q.status === 'saved').length;

  const updateItem = (id: string, updater: (item: QueueCardItem) => QueueCardItem) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
  };

  const scanSingleCard = async (item: QueueCardItem) => {
    updateItem(item.id, (cur) => ({
      ...cur,
      status: 'scanning',
      errorMessage: undefined,
    }));

    try {
      const result = await extractBusinessCardOcr(item.imageDataUrl, 'image/jpeg');
      const inferredArea = inferAreaFromAddress(`${result.address} ${result.companyName}`);
      updateItem(item.id, (cur) => ({
        ...cur,
        status: 'ready',
        fields: result,
        area: inferredArea,
      }));
    } catch (err: unknown) {
      updateItem(item.id, (cur) => ({
        ...cur,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'OCR extraction failed.',
      }));
    }
  };

  const handleFilesSelected = async (files: FileList | null, autoScanFirst: boolean) => {
    if (!files || files.length === 0) return;

    const newItems: QueueCardItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      try {
        const compressed = await compressImageFile(file, 1200, 0.78);
        newItems.push({
          id: generateId('scan'),
          fileName: file.name || `Card ${i + 1}`,
          imageDataUrl: compressed,
          status: 'queued',
          fields: { ...EMPTY_OCR },
          sourceTag: defaultSourceTag,
          grade: defaultGrade,
          area: 'Other',
          isDecisionMaker: true,
        });
      } catch {
        // Skip unreadable image file
      }
    }

    if (newItems.length === 0) return;

    setQueue((prev) => [...prev, ...newItems]);
    setSelectedId(newItems[0].id);

    // Automatically scan single capture or start batch scanning immediately for seamless field UX
    if (autoScanFirst || newItems.length === 1) {
      await scanSingleCard(newItems[0]);
    }
  };

  const handleScanAllQueued = async () => {
    const targets = queue.filter((q) => q.status === 'queued' || q.status === 'error');
    if (targets.length === 0) return;
    setIsBatchScanning(true);
    try {
      for (const item of targets) {
        await scanSingleCard(item);
      }
    } finally {
      setIsBatchScanning(false);
    }
  };

  const handleFieldChange = (field: keyof OcrCardResult, value: string) => {
    if (!selectedCard) return;
    updateItem(selectedCard.id, (cur) => {
      const nextFields = { ...cur.fields, [field]: value };
      const nextArea =
        field === 'address' ? inferAreaFromAddress(value) : cur.area;
      return { ...cur, fields: nextFields, area: nextArea };
    });
  };

  const handleCommitCard = (mode: 'merge' | 'new') => {
    if (!selectedCard) return;

    const savedCustId = onSaveCard({
      mode,
      existingCustomerId: mode === 'merge' ? duplicateMatch?.customer.id : undefined,
      existingContactId: mode === 'merge' ? duplicateMatch?.contact.id : undefined,
      fullName: selectedCard.fields.fullName.trim(),
      companyName: selectedCard.fields.companyName.trim(),
      title: selectedCard.fields.title.trim(),
      phone: selectedCard.fields.phone.trim(),
      email: selectedCard.fields.email.trim(),
      address: selectedCard.fields.address.trim(),
      area: selectedCard.area,
      notes: selectedCard.fields.notes.trim(),
      sourceTag: selectedCard.sourceTag,
      grade: selectedCard.grade,
      isDecisionMaker: selectedCard.isDecisionMaker,
      cardImageDataUrl: selectedCard.imageDataUrl,
    });

    updateItem(selectedCard.id, (cur) => ({
      ...cur,
      status: 'saved',
      savedCustomerId: savedCustId,
    }));

    // Auto-advance to next unsaved ready card in batch queue
    const nextUnsaved = queue.find(
      (item) => item.id !== selectedCard.id && item.status !== 'saved'
    );
    if (nextUnsaved) {
      setSelectedId(nextUnsaved.id);
    }
  };

  const handleRemoveItem = (id: string) => {
    setQueue((prev) => {
      const remaining = prev.filter((item) => item.id !== id);
      if (selectedId === id) {
        setSelectedId(remaining[0]?.id || null);
      }
      return remaining;
    });
  };

  const statusLabel = (item: QueueCardItem) => {
    if (item.status === 'saved') return { text: 'Saved', cls: 'text-emerald-700' };
    if (item.status === 'scanning') return { text: 'Scanning...', cls: 'text-blue-700' };
    if (item.status === 'error') return { text: 'Error', cls: 'text-red-700' };
    if (item.status === 'ready') {
      const dup = findContactByPhone(customers, item.fields.phone);
      if (dup) return { text: 'Duplicate phone', cls: 'text-amber-700 font-semibold' };
      return { text: 'Ready to review', cls: 'text-slate-700' };
    }
    return { text: 'Queued', cls: 'text-slate-500' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Gemini 2.5 Flash OCR · Automatic Phone Deduplication
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mt-1">
            Scan Business Cards
          </h1>
        </div>

        {/* Default Batch Settings + Upload Triggers */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Camera className="w-4 h-4" />
            <span>Take Card Photo</span>
          </button>
          <button
            type="button"
            onClick={() => batchInputRef.current?.click()}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm font-semibold hover:bg-slate-100 flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Images className="w-4 h-4" />
            <span>Batch Upload Cards</span>
          </button>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              void handleFilesSelected(e.target.files, true);
              e.target.value = '';
            }}
            className="hidden"
          />
          <input
            ref={batchInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              void handleFilesSelected(e.target.files, false);
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>
      </div>

      {/* Empty Drop/Start State */}
      {queue.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto">
            <Camera className="w-7 h-7" />
          </div>
          <div className="max-w-lg mx-auto space-y-2">
            <h2 className="text-lg font-bold text-slate-900">
              Capture a single card or queue a stack from a trade show
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Original card images are saved directly onto the customer profile. Every phone number is normalized and checked against your existing contacts before saving.
            </p>
          </div>

          {/* Default Source & Grade before batch capture */}
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3 pt-2 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Default Source Tag
              </label>
              <select
                value={defaultSourceTag}
                onChange={(e) => setDefaultSourceTag(e.target.value as SourceTag)}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
              >
                {SOURCE_TAGS.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Default Grade
              </label>
              <select
                value={defaultGrade}
                onChange={(e) => setDefaultGrade(e.target.value as CustomerGrade)}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>Take Photo</span>
            </button>
            <button
              type="button"
              onClick={() => batchInputRef.current?.click()}
              className="min-h-[46px] px-5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm font-semibold hover:bg-slate-50 inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Select Multiple Card Photos</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Batch Queue Column */}
          <aside className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Batch Queue ({queue.length})
                </h2>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {readyCount} ready · {savedCount} saved · {queuedCount} pending
                </p>
              </div>
              {queuedCount > 0 && (
                <button
                  type="button"
                  disabled={isBatchScanning}
                  onClick={handleScanAllQueued}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {isBatchScanning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>{isBatchScanning ? 'Scanning...' : `Scan All (${queuedCount})`}</span>
                </button>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
              {queue.map((item, idx) => {
                const isSelected = selectedCard?.id === item.id;
                const st = statusLabel(item);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <img
                        src={item.imageDataUrl}
                        alt={`Business card ${idx + 1}`}
                        className="w-16 h-11 object-cover rounded-lg border border-slate-200 shrink-0 bg-slate-100"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {item.fields.fullName || item.fields.companyName || `Card #${idx + 1}`}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs mt-0.5">
                          <span className={st.cls}>{st.text}</span>
                          {item.fields.phone && (
                            <>
                              <span className="text-slate-400" aria-hidden="true">·</span>
                              <span className="font-mono text-slate-500 truncate">
                                {item.fields.phone}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                      aria-label="Remove card from queue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Right Review & Edit Column */}
          {selectedCard && (
            <section className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
              {/* Card Image Preview + Scan Action */}
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <button
                  type="button"
                  onClick={() => setLightboxImage(selectedCard.imageDataUrl)}
                  className="w-full sm:w-64 aspect-[1.65/1] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 group relative"
                >
                  <img
                    src={selectedCard.imageDataUrl}
                    alt="Scanned business card preview"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-slate-900/75 text-white text-[11px] font-medium">
                    Tap to zoom
                  </span>
                </button>

                <div className="flex-1 space-y-3 w-full">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {selectedCard.status === 'saved'
                          ? 'Saved to CRM'
                          : 'Review Extracted Details'}
                      </h2>
                      <p className="text-xs text-slate-500">
                        Verify phone number, company name, and grade before saving.
                      </p>
                    </div>

                    {selectedCard.status !== 'saved' && (
                      <button
                        type="button"
                        disabled={selectedCard.status === 'scanning'}
                        onClick={() => scanSingleCard(selectedCard)}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {selectedCard.status === 'scanning' ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        <span>
                          {selectedCard.status === 'scanning'
                            ? 'Running OCR...'
                            : selectedCard.status === 'queued'
                              ? 'Run OCR Now'
                              : 'Re-scan Card'}
                        </span>
                      </button>
                    )}
                  </div>

                  {selectedCard.status === 'error' && selectedCard.errorMessage && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                      {selectedCard.errorMessage}
                    </div>
                  )}

                  {selectedCard.status === 'saved' && selectedCard.savedCustomerId && (
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>Card image and contact saved cleanly.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenCustomer(selectedCard.savedCustomerId!)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                      >
                        Open Customer 360°
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Phone Deduplication Warning Banner */}
              {duplicateMatch && selectedCard.status !== 'saved' && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-sm">
                      <div className="font-bold text-amber-950">
                        Matching phone number already exists ({normalizePhone(selectedCard.fields.phone)})
                      </div>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        Existing contact: <span className="font-semibold">{duplicateMatch.contact.fullName}</span>
                        {duplicateMatch.contact.title ? ` (${duplicateMatch.contact.title})` : ''} ·{' '}
                        <span className="font-mono">{duplicateMatch.contact.phone}</span> at{' '}
                        <span className="font-semibold">{duplicateMatch.customer.companyName}</span> (
                        {duplicateMatch.customer.area} · Grade {duplicateMatch.customer.grade} ·{' '}
                        {duplicateMatch.customer.status})
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleCommitCard('merge')}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Merge into Existing</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCommitCard('new')}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-amber-400 text-amber-950 text-xs font-semibold hover:bg-amber-100 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Save as New Anyway</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCustomer(duplicateMatch.customer.id)}
                      className="min-h-[44px] px-3 py-2 text-xs font-semibold text-amber-900 underline underline-offset-2"
                    >
                      View Existing File
                    </button>
                  </div>
                </div>
              )}

              {/* Editable Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    disabled={selectedCard.status === 'saved'}
                    value={selectedCard.fields.fullName}
                    onChange={(e) => handleFieldChange('fullName', e.target.value)}
                    placeholder="Not seen"
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    disabled={selectedCard.status === 'saved'}
                    value={selectedCard.fields.companyName}
                    onChange={(e) => handleFieldChange('companyName', e.target.value)}
                    placeholder="Not seen"
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Title / Designation
                  </label>
                  <input
                    type="text"
                    disabled={selectedCard.status === 'saved'}
                    value={selectedCard.fields.title}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    placeholder="Not seen"
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number (Deduplicated)
                  </label>
                  <input
                    type="tel"
                    disabled={selectedCard.status === 'saved'}
                    value={selectedCard.fields.phone}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    placeholder="Not seen"
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl text-slate-900 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    disabled={selectedCard.status === 'saved'}
                    value={selectedCard.fields.email}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    placeholder="Not seen"
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Industrial Area
                  </label>
                  <select
                    disabled={selectedCard.status === 'saved'}
                    value={selectedCard.area}
                    onChange={(e) =>
                      updateItem(selectedCard.id, (cur) => ({
                        ...cur,
                        area: e.target.value as AreaZone,
                      }))
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 disabled:bg-slate-50"
                  >
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    disabled={selectedCard.status === 'saved'}
                    value={selectedCard.fields.address}
                    onChange={(e) => handleFieldChange('address', e.target.value)}
                    placeholder="Not seen"
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 disabled:bg-slate-50"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes (Extra lines, UEN, website, fleet context)
                  </label>
                  <textarea
                    rows={2}
                    disabled={selectedCard.status === 'saved'}
                    value={selectedCard.fields.notes}
                    onChange={(e) => handleFieldChange('notes', e.target.value)}
                    placeholder="Not seen"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Source Tag, Customer Grade & Decision Maker */}
              <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Source Tag
                  </label>
                  <select
                    disabled={selectedCard.status === 'saved'}
                    value={selectedCard.sourceTag}
                    onChange={(e) =>
                      updateItem(selectedCard.id, (cur) => ({
                        ...cur,
                        sourceTag: e.target.value as SourceTag,
                      }))
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 disabled:bg-slate-50"
                  >
                    {SOURCE_TAGS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Grade
                  </label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
                    {GRADES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        disabled={selectedCard.status === 'saved'}
                        onClick={() =>
                          updateItem(selectedCard.id, (cur) => ({ ...cur, grade: g }))
                        }
                        className={`min-h-[36px] rounded-lg text-sm font-bold transition-colors ${
                          selectedCard.grade === g
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={selectedCard.status === 'saved'}
                    checked={selectedCard.isDecisionMaker}
                    onChange={(e) =>
                      updateItem(selectedCard.id, (cur) => ({
                        ...cur,
                        isDecisionMaker: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span className="text-sm font-medium text-slate-800">Decision Maker</span>
                </label>
              </div>

              {/* Save Footer */}
              {selectedCard.status !== 'saved' && !duplicateMatch && (
                <div className="pt-2 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={
                      selectedCard.status === 'scanning' ||
                      (!selectedCard.fields.companyName.trim() &&
                        !selectedCard.fields.fullName.trim())
                    }
                    onClick={() => handleCommitCard('new')}
                    className="min-h-[46px] px-6 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition-colors"
                  >
                    Save Customer & Card Image
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Fullscreen Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25"
            aria-label="Close image preview"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Full-size scanned business card"
            className="max-w-full max-h-[85vh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
