import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { AppState, Customer } from '../types';
import {
  CsvImportPreviewRow,
  downloadTextFile,
  exportCustomersContactsCsv,
  exportVehiclesCsv,
  getSampleCsvTemplate,
  parseCsvToImportPreview,
} from '../utils/csv';
import { getTodayIso } from '../utils/helpers';

interface DataViewProps {
  state: AppState;
  onCommitCsvImport: (rows: CsvImportPreviewRow[]) => {
    created: number;
    merged: number;
    skipped: number;
  };
  onResetSampleData: () => void;
}

export const DataView: React.FC<DataViewProps> = ({
  state,
  onCommitCsvImport,
  onResetSampleData,
}) => {
  const today = getTodayIso();
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const [previewRows, setPreviewRows] = useState<CsvImportPreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importBanner, setImportBanner] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [confirmingReset, setConfirmingReset] = useState<boolean>(false);

  const totalContacts = state.customers.reduce((acc, c) => acc + c.contacts.length, 0);
  const totalVehicles = state.customers.reduce((acc, c) => acc + c.vehicles.length, 0);
  const totalCardImages = state.customers.reduce(
    (acc, c) => acc + c.contacts.filter((ct) => Boolean(ct.cardImageDataUrl)).length,
    0
  );

  const handleExportCustomersCsv = () => {
    const csv = exportCustomersContactsCsv(state.customers);
    downloadTextFile(`lewis-sales-customers-${today}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const handleExportVehiclesCsv = () => {
    const csv = exportVehiclesCsv(state.customers);
    downloadTextFile(`lewis-sales-vehicles-${today}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const handleExportJsonBackup = () => {
    const json = JSON.stringify(state, null, 2);
    downloadTextFile(`lewis-sales-backup-${today}.json`, json, 'application/json');
  };

  const handleDownloadTemplate = () => {
    const template = getSampleCsvTemplate();
    downloadTextFile('lewis-sales-import-template.csv', template, 'text/csv;charset=utf-8;');
  };

  const handleCsvFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError('');
    setImportBanner('');
    try {
      const text = await file.text();
      const rows = parseCsvToImportPreview(text, state.customers);
      if (rows.length === 0) {
        setImportError(
          'No valid contact or company rows found. Ensure your CSV has a header row (e.g. Company Name, Contact Name, Phone).'
        );
        setPreviewRows([]);
        return;
      }
      setImportFileName(file.name);
      setPreviewRows(rows);
    } catch {
      setImportError('Failed to read CSV file. Please verify the file is plain UTF-8 CSV.');
    }
  };

  const updateRowAction = (rowIndex: number, action: CsvImportPreviewRow['action']) => {
    setPreviewRows((prev) =>
      prev.map((r) => (r.rowIndex === rowIndex ? { ...r, action } : r))
    );
  };

  const handleApplyImport = () => {
    const summary = onCommitCsvImport(previewRows);
    setImportBanner(
      `Import complete: ${summary.created} created, ${summary.merged} merged into existing contacts, ${summary.skipped} skipped.`
    );
    setPreviewRows([]);
    setImportFileName('');
  };

  const duplicateCount = previewRows.filter((r) => r.duplicateMatch || r.duplicateInFile).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-5 border-b border-slate-200">
        <p className="text-xs font-medium text-slate-500">
          Local-First Persistence · Keep Master Excel Separate
        </p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mt-1">
          CSV Import, Export & Data Safety
        </h1>
      </div>

      {/* Live Local Storage Inventory */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl">
          <div className="text-xs text-slate-500">Customers</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {state.customers.length}
          </div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl">
          <div className="text-xs text-slate-500">Contacts</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {totalContacts}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            {totalCardImages} card image{totalCardImages === 1 ? '' : 's'}
          </div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl">
          <div className="text-xs text-slate-500">Vehicles</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {totalVehicles}
          </div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl">
          <div className="text-xs text-slate-500">Follow-Ups</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {state.followUps.length}
          </div>
        </div>
      </div>

      {/* Export & Import Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Section */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Export to Excel / CSV</h2>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Download UTF-8 Excel-ready CSV sheets for your customer directory and fleet expiry schedule, or export a full JSON snapshot.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleExportCustomersCsv}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 flex items-center justify-between transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Customers & Contacts CSV</span>
              </span>
              <span className="text-xs font-mono opacity-85">{totalContacts} rows</span>
            </button>

            <button
              type="button"
              onClick={handleExportVehiclesCsv}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm font-semibold hover:bg-slate-50 flex items-center justify-between transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Fleet & Expiry Dates CSV</span>
              </span>
              <span className="text-xs font-mono text-slate-500">{totalVehicles} units</span>
            </button>

            <button
              type="button"
              onClick={handleExportJsonBackup}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 text-slate-800 text-xs font-semibold hover:bg-slate-200 flex items-center justify-between transition-colors"
            >
              <span>Download Full JSON Backup (includes card photos & follow-ups)</span>
              <Download className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Import Section */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Import CSV with Phone Deduplication
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Test spreadsheet CRM imports safely. Every phone number is normalized and matched against existing contacts before anything is written.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Choose CSV File</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50 inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Sample CSV Template</span>
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileSelected}
              className="hidden"
            />
          </div>

          {importError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
              {importError}
            </div>
          )}

          {importBanner && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{importBanner}</span>
            </div>
          )}
        </section>
      </div>

      {/* CSV Import Preview & Deduplication Table */}
      {previewRows.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Import Preview: {importFileName}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                <span className="font-mono tabular-nums font-semibold">{previewRows.length}</span>{' '}
                row{previewRows.length === 1 ? '' : 's'} parsed ·{' '}
                <span className="font-mono tabular-nums font-semibold text-amber-800">
                  {duplicateCount}
                </span>{' '}
                phone duplicate{duplicateCount === 1 ? '' : 's'} detected
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewRows([]);
                  setImportFileName('');
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
              >
                Commit Import
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Company & Area</th>
                  <th className="py-3 px-4">Contact & Phone</th>
                  <th className="py-3 px-4">Grade / Status</th>
                  <th className="py-3 px-4">Deduplication Check</th>
                  <th className="py-3 px-4 text-right">Import Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {previewRows.map((row) => (
                  <tr key={row.rowIndex} className="align-middle">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{row.companyName}</div>
                      <div className="text-xs text-slate-500">{row.area}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-slate-900">{row.fullName || 'Not seen'}</div>
                      <div className="text-xs font-mono tabular-nums text-slate-600">
                        {row.phone || 'Not seen'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">
                      Grade {row.grade} · {row.status}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {row.duplicateMatch ? (
                        <div className="flex items-start gap-1.5 text-amber-800 font-medium">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                          <span>
                            Matches {row.duplicateMatch.contact.fullName} at{' '}
                            {row.duplicateMatch.customer.companyName}
                          </span>
                        </div>
                      ) : row.duplicateInFile ? (
                        <span className="text-amber-800 font-medium">
                          Duplicate phone inside CSV
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-medium">Unique phone</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <select
                        value={row.action}
                        onChange={(e) =>
                          updateRowAction(
                            row.rowIndex,
                            e.target.value as CsvImportPreviewRow['action']
                          )
                        }
                        className="min-h-[38px] px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-900"
                      >
                        {row.duplicateMatch && (
                          <option value="merge">Merge into Existing</option>
                        )}
                        <option value="create">Save as New</option>
                        <option value="skip">Skip Row</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Data Safety & Reset Sample Data */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Local Storage & Sample Reset</h2>
            <p className="text-xs text-slate-600 mt-0.5 max-w-xl leading-relaxed">
              All customers, business card images, fleet expiries, and follow-ups save automatically to this browser&apos;s localStorage. Reset restores the 4 commercial cold-chain &amp; EV fleet sample accounts.
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {!confirmingReset ? (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 inline-flex items-center gap-2 whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Sample Data</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetSampleData();
                  setConfirmingReset(false);
                  setPreviewRows([]);
                  setImportBanner('Restored the 4 sample commercial fleet accounts and follow-ups.');
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
              >
                Confirm Reset
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
