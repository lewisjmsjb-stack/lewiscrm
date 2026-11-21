import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  Mic,
  Phone,
  Square,
  Upload,
  Wand2,
  X,
  MessageSquare,
  MapPin,
} from 'lucide-react';
import { CHANNELS, Customer, FollowUp, FollowUpChannel } from '../types';
import { addDaysIso, blobToBase64, generateId, getTodayIso } from '../utils/helpers';
import { extractFollowUpFromInput } from '../services/geminiClient';

interface FollowUpModalProps {
  isOpen: boolean;
  customers: Customer[];
  initialCustomerId?: string;
  initialChannel?: FollowUpChannel;
  initialNextStep?: string;
  onClose: () => void;
  onSave: (followUp: FollowUp) => void;
}

export const FollowUpModal: React.FC<FollowUpModalProps> = ({
  isOpen,
  customers,
  initialCustomerId,
  initialChannel = 'Visit',
  initialNextStep = '',
  onClose,
  onSave,
}) => {
  const today = getTodayIso();
  const tomorrow = addDaysIso(today, 1);

  const [customerId, setCustomerId] = useState<string>(
    initialCustomerId || customers[0]?.id || ''
  );
  const [contactId, setContactId] = useState<string>('');
  const [channel, setChannel] = useState<FollowUpChannel>(initialChannel);
  const [exactCustomerWords, setExactCustomerWords] = useState<string>('');
  const [nextStep, setNextStep] = useState<string>(initialNextStep);
  const [nextStepDate, setNextStepDate] = useState<string>(
    initialChannel === 'Visit' ? tomorrow : tomorrow
  );
  const [sourceAudioNote, setSourceAudioNote] = useState<boolean>(false);

  // Voice & Quick Note extraction state
  const [quickNoteText, setQuickNoteText] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string>('');
  const [extractSuccessMsg, setExtractSuccessMsg] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const defaultCustId = initialCustomerId || customers[0]?.id || '';
    setCustomerId(defaultCustId);
    const cust = customers.find((c) => c.id === defaultCustId);
    const dm = cust?.contacts.find((ct) => ct.isDecisionMaker) || cust?.contacts[0];
    setContactId(dm?.id || '');
    setChannel(initialChannel);
    setExactCustomerWords('');
    setNextStep(initialNextStep);
    setNextStepDate(initialChannel === 'Visit' ? tomorrow : today);
    setQuickNoteText('');
    setExtractError('');
    setExtractSuccessMsg('');
    setSourceAudioNote(false);
  }, [isOpen, initialCustomerId, initialChannel, initialNextStep, customers, today, tomorrow]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  if (!isOpen) return null;

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const handleCustomerChange = (newId: string) => {
    setCustomerId(newId);
    const cust = customers.find((c) => c.id === newId);
    const dm = cust?.contacts.find((ct) => ct.isDecisionMaker) || cust?.contacts[0];
    setContactId(dm?.id || '');
  };

  const handleChannelChange = (newChannel: FollowUpChannel) => {
    setChannel(newChannel);
    if (newChannel === 'Visit') {
      // Automatically default next-day follow-up when logging a Visit/Meeting
      setNextStepDate(tomorrow);
    }
  };

  const runExtraction = async (payload: {
    audioBase64?: string;
    audioMimeType?: string;
    textNote?: string;
    isAudio?: boolean;
  }) => {
    setIsExtracting(true);
    setExtractError('');
    setExtractSuccessMsg('');
    try {
      const result = await extractFollowUpFromInput({
        audioBase64: payload.audioBase64,
        audioMimeType: payload.audioMimeType,
        textNote: payload.textNote,
        todayIso: today,
        channel,
      });

      if (result.exactCustomerWords) {
        setExactCustomerWords(result.exactCustomerWords);
      }
      if (result.nextStep) {
        setNextStep(result.nextStep);
      }
      if (result.suggestedNextDate) {
        setNextStepDate(result.suggestedNextDate);
      } else if (channel === 'Visit') {
        setNextStepDate(tomorrow);
      }
      if (payload.isAudio) {
        setSourceAudioNote(true);
      }
      setExtractSuccessMsg('Extracted customer words, next step, and suggested date. Review before saving.');
    } catch (err: unknown) {
      setExtractError(err instanceof Error ? err.message : 'Unable to extract follow-up.');
    } finally {
      setIsExtracting(false);
    }
  };

  const startRecording = async () => {
    setExtractError('');
    setExtractSuccessMsg('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setExtractError('Microphone recording is unavailable in this browser. Upload an audio file or type a quick note below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsRecording(false);
        const audioBlob = new Blob(audioChunksRef.current, { type: preferredMime });
        if (audioBlob.size < 200) {
          setExtractError('Recording was too short. Please try again or type a quick note.');
          return;
        }
        const base64 = await blobToBase64(audioBlob);
        await runExtraction({
          audioBase64: base64,
          audioMimeType: preferredMime.split(';')[0],
          isAudio: true,
        });
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setExtractError('Microphone permission denied or unavailable. Upload an audio clip or type a quick note below.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleAudioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setExtractError('');
    try {
      const base64 = await blobToBase64(file);
      await runExtraction({
        audioBase64: base64,
        audioMimeType: file.type || 'audio/mp3',
        isAudio: true,
      });
    } catch (err: unknown) {
      setExtractError(err instanceof Error ? err.message : 'Could not read audio file.');
    }
  };

  const handleExtractQuickNote = async () => {
    if (!quickNoteText.trim()) {
      setExtractError('Type or paste a quick field note first.');
      return;
    }
    await runExtraction({ textNote: quickNoteText.trim(), isAudio: false });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !nextStep.trim()) return;

    const newFollowUp: FollowUp = {
      id: generateId('fu'),
      customerId,
      contactId: contactId || undefined,
      channel,
      exactCustomerWords: exactCustomerWords.trim(),
      nextStep: nextStep.trim(),
      nextStepDate: nextStepDate || tomorrow,
      status: 'Pending',
      sourceAudioNote,
      createdAt: today,
    };

    onSave(newFollowUp);
    onClose();
  };

  const channelIcon = (ch: FollowUpChannel) => {
    if (ch === 'Call') return <Phone className="w-4 h-4" />;
    if (ch === 'WhatsApp') return <MessageSquare className="w-4 h-4" />;
    return <MapPin className="w-4 h-4" />;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="followup-modal-title"
    >
      <div className="w-full max-w-2xl bg-white rounded-t-3xl md:rounded-2xl max-h-[92vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden">
        {/* Grab handle on mobile */}
        <div className="md:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 id="followup-modal-title" className="text-lg font-bold text-slate-900">
              Log Follow-Up
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Record a voice note, paste rough notes, or enter details directly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form id="followup-form" onSubmit={handleSubmit} className="overflow-y-auto px-5 py-5 space-y-5">
          {/* Customer & Contact Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Customer Account
              </label>
              <select
                value={customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                required
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} ({c.area})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Contact Person
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              >
                <option value="">General account follow-up</option>
                {(selectedCustomer?.contacts || []).map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.fullName} {ct.title ? `— ${ct.title}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Channel Segmented Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Channel</label>
              {channel === 'Visit' && (
                <span className="text-xs text-blue-700 font-medium">
                  Visit defaults next follow-up to tomorrow ({tomorrow})
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => handleChannelChange(ch)}
                  className={`min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                    channel === ch
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {channelIcon(ch)}
                  <span>{ch}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Voice Note / Quick Text Gemini Extraction Panel */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Voice Note or Quick Note Extractor
                </h3>
                <p className="text-xs text-slate-600">
                  Speak after a depot visit, upload an audio clip, or paste rough notes to auto-fill below.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isRecording ? (
                  <button
                    type="button"
                    disabled={isExtracting}
                    onClick={startRecording}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap transition-colors"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Record Voice</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 flex items-center gap-2 whitespace-nowrap transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span className="font-mono tabular-nums">
                      Stop ({String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
                      {String(recordSeconds % 60).padStart(2, '0')})
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isExtracting || isRecording}
                  onClick={() => audioFileInputRef.current?.click()}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload Audio</span>
                </button>
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioFileUpload}
                  className="hidden"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                rows={2}
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                placeholder="No mic right now? Paste or type rough notes (e.g. 'Met Raymond at Jurong, wants 14ft Thermo King quote by Friday, asked about trade-in for YK4821M')..."
                className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                disabled={isExtracting || isRecording || !quickNoteText.trim()}
                onClick={handleExtractQuickNote}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                {isExtracting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                <span>{isExtracting ? 'Extracting...' : 'Extract Note'}</span>
              </button>
            </div>

            {isExtracting && (
              <div className="flex items-center gap-2 text-xs text-blue-700 font-medium">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analyzing note with Gemini 2.5 Flash...</span>
              </div>
            )}

            {extractError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{extractError}</span>
              </div>
            )}

            {extractSuccessMsg && (
              <p className="text-xs font-medium text-emerald-700">{extractSuccessMsg}</p>
            )}
          </div>

          {/* Structured Follow-Up Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Customer&apos;s Exact Words
              </label>
              <textarea
                rows={3}
                value={exactCustomerWords}
                onChange={(e) => setExactCustomerWords(e.target.value)}
                placeholder="Record exact requests, objections, or vehicle requirements (leave blank if none stated)."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Next Step Action *
                </label>
                <input
                  type="text"
                  required
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  placeholder="e.g., Send 14ft chiller quote via WhatsApp"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Next Step Date *
                </label>
                <input
                  type="date"
                  required
                  value={nextStepDate}
                  onChange={(e) => setNextStepDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Sticky Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="followup-form"
            disabled={!customerId || !nextStep.trim()}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-40 transition-colors"
          >
            Save Follow-Up
          </button>
        </div>
      </div>
    </div>
  );
};
