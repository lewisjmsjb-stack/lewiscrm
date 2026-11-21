import React, { useEffect, useState, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  Save,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Customer } from '../types';
import { analyzeUploadedDocument, checkAiHealth, DocumentAnalysisResult } from '../services/geminiClient';
import { getTodayIso } from '../utils/helpers';

interface DocumentAnalyzerModalProps {
  isOpen: boolean;
  customers: Customer[];
  initialCustomerId?: string | null;
  onClose: () => void;
  onSaveToCustomer: (
    customerId: string,
    summaryText: string,
    followUpTask?: { nextStep: string; date: string }
  ) => void;
  showToast: (msg: string) => void;
}

const PRESET_QUESTIONS = [
  'Full Summary',
  'Extract Specs & Prices',
  'Check ACRA / Legal & Payment Risks',
  'Compare Competitor Quote',
  'Inspect Truck / Reefer Photo',
];

export const DocumentAnalyzerModal: React.FC<DocumentAnalyzerModalProps> = ({
  isOpen,
  customers,
  initialCustomerId,
  onClose,
  onSaveToCustomer,
  showToast,
}) => {
  const today = getTodayIso();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [aiConnected, setAiConnected] = useState<boolean | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    fileBase64: string;
    mimeType: string;
    fileName: string;
    previewUrl?: string;
  } | null>(null);

  const [question, setQuestion] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<DocumentAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [targetCustomerId, setTargetCustomerId] = useState<string>('');
  const [createFollowUp, setCreateFollowUp] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;
    checkAiHealth().then((health) => {
      setAiConnected(health.geminiConfigured);
    });

    if (initialCustomerId) {
      setTargetCustomerId(initialCustomerId);
    } else if (customers.length > 0 && !targetCustomerId) {
      setTargetCustomerId(customers[0].id);
    }
  }, [isOpen, initialCustomerId, customers]);

  if (!isOpen) return null;

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('File size exceeds 15MB limit. Please choose a smaller file.');
      return;
    }

    const mimeType = file.type || 'application/octet-stream';
    const reader = new FileReader();

    reader.onload = () => {
      const base64 = reader.result as string;
      setSelectedFile({
        fileBase64: base64,
        mimeType,
        fileName: file.name,
        previewUrl: mimeType.startsWith('image/') ? base64 : undefined,
      });
      setErrorMsg('');
      setAnalysisResult(null);
    };

    reader.onerror = () => {
      setErrorMsg('Failed to read file.');
    };

    reader.readAsDataURL(file);
  };

  const handleAnalyze = async (customQ?: string) => {
    if (!selectedFile) {
      setErrorMsg('Please upload a document or image first.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const qToUse = customQ !== undefined ? customQ : question;
      const result = await analyzeUploadedDocument({
        fileBase64: selectedFile.fileBase64,
        mimeType: selectedFile.mimeType,
        fileName: selectedFile.fileName,
        question: qToUse,
      });
      setAnalysisResult(result);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Document analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = () => {
    if (!analysisResult) return;
    if (!targetCustomerId) {
      setErrorMsg('Please select a target customer record.');
      return;
    }

    const textBlock = [
      `[AI Document Analysis: ${analysisResult.documentType}]`,
      `Summary: ${analysisResult.summary}`,
      analysisResult.answer ? `Key Takeaway / Answer: ${analysisResult.answer}` : '',
      analysisResult.extractedFields.length > 0
        ? `Extracted: ${analysisResult.extractedFields.map((f) => `${f.label}: ${f.value}`).join(' | ')}`
        : '',
      analysisResult.risksAndFlags.length > 0
        ? `Risks / Flags: ${analysisResult.risksAndFlags.join('; ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const fuTask = createFollowUp
      ? {
          nextStep: analysisResult.suggestedNextStep || `Follow up on document: ${analysisResult.documentType}`,
          date: today,
        }
      : undefined;

    onSaveToCustomer(targetCustomerId, textBlock, fuTask);
    showToast('Saved AI analysis to customer notes and follow-up!');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-700 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Universal AI Document &amp; Image Analyzer</h2>
              <p className="text-xs text-slate-500">Powered by Gemini 2.5 Flash Multimodal Intelligence</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Connection Status Pill */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-100 border border-slate-200 text-xs">
            <span className="font-semibold text-slate-700">Gemini API Status:</span>
            {aiConnected === null ? (
              <span className="text-slate-500 inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking connection...
              </span>
            ) : aiConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Gemini 2.5 Flash Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" /> GEMINI_API_KEY Missing — Check Settings &gt; Secrets
              </span>
            )}
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Upload Dropzone / Preview */}
          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-3xl p-8 text-center cursor-pointer bg-slate-50 hover:bg-blue-50/40 transition-colors flex flex-col items-center justify-center gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-sm">
                <FileUp className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900">Click to upload document or image</p>
                <p className="text-xs text-slate-500">Supports PDF, TXT, CSV, JPG, PNG, WEBP (Max 15MB)</p>
              </div>
              <button
                type="button"
                className="mt-1 px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold shadow-sm hover:bg-blue-800"
              >
                Browse Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*,.txt,.csv"
                onChange={handleFileSelected}
                className="hidden"
              />
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {selectedFile.previewUrl ? (
                  <img
                    src={selectedFile.previewUrl}
                    alt="Preview"
                    className="w-12 h-12 object-cover rounded-xl border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{selectedFile.fileName}</p>
                  <p className="text-xs text-slate-500 font-mono uppercase">{selectedFile.mimeType}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setAnalysisResult(null);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white shrink-0"
              >
                Change File
              </button>
            </div>
          )}

          {/* Presets & Question Box */}
          {selectedFile && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Quick Analysis Presets or Custom Question
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_QUESTIONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setQuestion(preset);
                      handleAnalyze(preset);
                    }}
                    disabled={isAnalyzing}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-xs font-semibold text-slate-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>{preset}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask anything about this document or image (English or 中文)..."
                  className="flex-1 min-h-[44px] px-3.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => handleAnalyze()}
                  disabled={isAnalyzing}
                  className="min-h-[44px] px-5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-md shrink-0"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analyze</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Results View */}
          {analysisResult && (
            <div className="space-y-4 pt-3 border-t border-slate-200 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold font-mono">
                  {analysisResult.documentType}
                </span>
                <span className="text-xs text-slate-500">Gemini 2.5 Flash Verified</span>
              </div>

              {analysisResult.answer && (
                <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-1">
                  <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">Key Takeaway / Answer</h4>
                  <p className="text-sm text-blue-950 leading-relaxed font-medium">{analysisResult.answer}</p>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Summary</h4>
                <p className="text-xs text-slate-800 leading-relaxed">{analysisResult.summary}</p>
              </div>

              {/* Extracted Fields Table */}
              {analysisResult.extractedFields.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Extracted Fields &amp; Specs
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-white">
                    {analysisResult.extractedFields.map((field, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between gap-2 border-b border-slate-100">
                        <span className="text-xs font-medium text-slate-500">{field.label}</span>
                        <span className="text-xs font-bold font-mono text-slate-900 text-right">{field.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risks & Flags */}
              {analysisResult.risksAndFlags.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700" /> Risks &amp; Compliance Flags
                  </h4>
                  <ul className="list-disc list-inside text-xs text-amber-950 space-y-1">
                    {analysisResult.risksAndFlags.map((risk, idx) => (
                      <li key={idx}>{risk}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggested Next Step */}
              {analysisResult.suggestedNextStep && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span><strong>Recommended Next Step:</strong> {analysisResult.suggestedNextStep}</span>
                </div>
              )}

              {/* Save to CRM Controls */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Save Insights to CRM</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Target Customer</label>
                    <select
                      value={targetCustomerId}
                      onChange={(e) => setTargetCustomerId(e.target.value)}
                      className="w-full min-h-[42px] px-3 text-sm bg-white border border-slate-300 rounded-xl text-slate-900"
                    >
                      {customers.length === 0 ? (
                        <option value="">No customers available</option>
                      ) : (
                        customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.companyName} ({c.area})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={createFollowUp}
                        onChange={(e) => setCreateFollowUp(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <span>Also create follow-up task for next step</span>
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!targetCustomerId}
                  className="w-full min-h-[46px] rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold shadow-md flex items-center justify-center gap-2 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Analysis to Customer Notes &amp; Follow-Up</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
