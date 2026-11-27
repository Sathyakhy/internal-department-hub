import * as XLSX from 'xlsx';

export interface ExcelTemplateColumn {
  header: string;
  example: string | number | boolean;
  width?: number;
}

export function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function formatExcelCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).trim();
}

export function getRowField(
  normalizedRow: Record<string, string>,
  ...candidateKeys: string[]
): string {
  for (const key of candidateKeys) {
    const norm = normalizeHeaderKey(key);
    const val = normalizedRow[norm];
    if (val !== undefined && val !== '') {
      return val;
    }
  }
  return '';
}

export function parseBooleanCell(val: string, fallback = false): boolean {
  if (!val) return fallback;
  const lower = val.trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(lower)) return true;
  if (['false', 'no', 'n', '0'].includes(lower)) return false;
  return fallback;
}

export function downloadExcelTemplate(
  filename: string,
  sheetName: string,
  columns: ExcelTemplateColumn[]
): void {
  const headers = columns.map((c) => c.header);
  const exampleRow = columns.map((c) => c.example);

  const worksheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  worksheet['!cols'] = columns.map((c) => ({
    wch: c.width ?? Math.max(c.header.length + 4, String(c.example).length + 4, 16),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, safeName);
}

export async function parseSpreadsheetFile(
  file: File
): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: false,
  });

  return rawRows
    .map((row) => {
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        const nk = normalizeHeaderKey(k);
        if (nk) {
          normalized[nk] = formatExcelCellValue(v);
        }
      }
      return normalized;
    })
    .filter((row) => Object.values(row).some((v) => v !== ''));
}
