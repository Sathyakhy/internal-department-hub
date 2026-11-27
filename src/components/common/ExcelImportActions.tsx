import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { parseSpreadsheetFile } from '../../utils/excel';

interface ExcelImportActionsProps {
  onDownloadTemplate: () => void;
  onImportRows: (rows: Record<string, string>[]) => void;
  templateTitle?: string;
  importTitle?: string;
  disabled?: boolean;
  compact?: boolean;
  onError?: (msg: string) => void;
}

export const ExcelImportActions: React.FC<ExcelImportActionsProps> = ({
  onDownloadTemplate,
  onImportRows,
  templateTitle = 'Download Excel Template (.xlsx)',
  importTitle = 'Import from Excel (.xlsx / .csv)',
  disabled = false,
  compact = false,
  onError,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const sizeCls = compact ? 'h-8 w-8' : 'h-9 w-9';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parseSpreadsheetFile(file);
      if (rows.length === 0) {
        onError?.('The uploaded spreadsheet contains no data rows.');
        return;
      }
      onImportRows(rows);
    } catch {
      onError?.('Could not parse spreadsheet. Please use the downloadable Excel template.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={onDownloadTemplate}
        title={templateTitle}
        aria-label={templateTitle}
        className={`${sizeCls} inline-flex items-center justify-center rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 hover:border-sky-500/50 transition-colors disabled:opacity-40`}
      >
        <FileSpreadsheet className="h-4 w-4 text-sky-600 dark:text-sky-400" />
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        type="button"
        disabled={disabled || importing}
        onClick={() => fileRef.current?.click()}
        title={importTitle}
        aria-label={importTitle}
        className={`${sizeCls} inline-flex items-center justify-center rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 hover:border-sky-500/50 transition-colors disabled:opacity-40`}
      >
        <Upload className={`h-4 w-4 text-amber-500 dark:text-amber-400 ${importing ? 'animate-pulse' : ''}`} />
      </button>
    </div>
  );
};
