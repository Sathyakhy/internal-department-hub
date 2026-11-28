function parseLocalDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

export function formatTenure(startDate?: string, endDate?: string | null): string {
  const start = parseLocalDate(startDate);
  if (!start) return 'N/A';

  const end = endDate ? parseLocalDate(endDate) ?? new Date() : new Date();
  if (end < start) return '< 1 mo';

  let totalMonths =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) {
    totalMonths -= 1;
  }
  totalMonths = Math.max(0, totalMonths);

  if (totalMonths === 0) return '< 1 mo';

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  }
  if (months > 0) {
    parts.push(`${months} ${months === 1 ? 'mo' : 'mos'}`);
  }

  return parts.join(' ');
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatMonthYear(dateStr?: string | null): string {
  const parsed = parseLocalDate(dateStr);
  if (!parsed) return 'Unknown';
  return `${MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

export function hasJoinedOverMonths(startDate?: string, monthsThreshold = 3): boolean {
  const start = parseLocalDate(startDate);
  if (!start) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetMonthIndex = start.getMonth() + monthsThreshold;
  const targetYear = start.getFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const cutoff = new Date(targetYear, targetMonth, Math.min(start.getDate(), lastDayOfTargetMonth));
  return today >= cutoff;
}

