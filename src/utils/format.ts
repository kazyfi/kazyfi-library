export function formatDateId(isoString: string | null): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(isoString));
}

export function formatDateTimeId(isoString: string | null): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString));
}

export function formatRelativeTimeId(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays} hari lalu`;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getDueCountdownText(dueAtIso: string, status: string): string {
  if (status === 'returned') return 'Sudah dikembalikan';
  const now = new Date();
  const due = new Date(dueAtIso);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Terlambat ${Math.abs(diffDays)} hari`;
  if (diffDays === 0) return 'Jatuh tempo hari ini';
  return `Sisa ${diffDays} hari`;
}
