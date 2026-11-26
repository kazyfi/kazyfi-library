import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  BookCopy,
  BookOpen,
  Eye,
  FileSpreadsheet,
  History,
  Library,
  Lock,
  LogOut,
  Menu,
  ScanBarcode,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityModal } from './components/AccessibilityModal';
import { AdminDashboard, type AdminTab } from './components/AdminDashboard';
import { AdminLoginModal } from './components/AdminLoginModal';
import { MemberDashboard, type MemberTab } from './components/MemberDashboard';
import type {
  AccessibilityPrefs,
  ActivityEvent,
  AutomatedReport,
  Book,
  BookReview,
  LibraryBootstrapPayload,
  LibraryStatistics,
  Loan,
  Member,
  ReportFrequency,
  ReportKind,
  ReportSchedule,
  Reservation,
  SessionInfo,
  UserRole,
} from './types/library';

interface ToastMessage {
  id: string;
  kind: 'success' | 'error';
  text: string;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);

  const [a11yPrefs, setA11yPrefs] = useState<AccessibilityPrefs>({
    theme: 'light',
    fontScale: 'normal',
    highContrast: false,
    dyslexiaSpacing: false,
  });

  // Server-authoritative state
  const [books, setBooks] = useState<Book[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reviews, setReviews] = useState<BookReview[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [reports, setReports] = useState<AutomatedReport[]>([]);
  const [reportSchedule, setReportSchedule] = useState<ReportSchedule>({
    enabled: true,
    frequency: 'daily',
    runHour: 17,
    lastRunAt: null,
    nextRunAt: new Date().toISOString(),
  });
  const [stats, setStats] = useState<LibraryStatistics | null>(null);
  const [connectedClients, setConnectedClients] = useState(1);
  const [sseConnected, setSseConnected] = useState(false);

  // Session & navigation state (token kept strictly in React memory)
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTab>('overview');
  const [memberTab, setMemberTab] = useState<MemberTab>('catalog');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Apply inclusive accessibility classes to documentElement
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', a11yPrefs.theme === 'dark');
    root.classList.toggle('a11y-scale-lg', a11yPrefs.fontScale === 'lg');
    root.classList.toggle('a11y-scale-xl', a11yPrefs.fontScale === 'xl');
    root.classList.toggle('a11y-contrast', a11yPrefs.highContrast);
    root.classList.toggle('a11y-dyslexia', a11yPrefs.dyslexiaSpacing);
  }, [a11yPrefs]);

  const pushToast = useCallback((kind: 'success' | 'error', text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, kind, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const applySyncPayload = useCallback((data: LibraryBootstrapPayload) => {
    setBooks(data.books ?? []);
    setMembers(data.members ?? []);
    setLoans(data.loans ?? []);
    setReservations(data.reservations ?? []);
    setReviews(data.reviews ?? []);
    setActivities(data.activities ?? []);
    setReports(data.reports ?? []);
    if (data.reportSchedule) setReportSchedule(data.reportSchedule);
    if (data.stats) setStats(data.stats);
    setConnectedClients(data.connectedClients ?? 1);
  }, []);

  const switchSession = useCallback(
    async (role: UserRole, memberId?: string) => {
      try {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, memberId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Gagal memulai sesi');
        }
        setSession(data as SessionInfo);
      } catch (err) {
        pushToast('error', err instanceof Error ? err.message : 'Gagal berpindah sesi');
      }
    },
    [pushToast]
  );

  const handleAdminAuthenticated = useCallback(
    (adminSession: SessionInfo) => {
      setSession(adminSession);
      setAdminTab('overview');
      setAdminLoginOpen(false);
      setSidebarOpen(false);
      pushToast('success', `Selamat datang, ${adminSession.name} (Admin Kazyfi Library).`);
    },
    [pushToast]
  );

  const handleLogoutAdmin = useCallback(async () => {
    await switchSession('member', members[0]?.id);
    setMemberTab('catalog');
    setSidebarOpen(false);
    pushToast('success', 'Anda telah keluar dari sesi Admin.');
  }, [switchSession, members, pushToast]);

  // Initial load + Member default session + SSE live subscription
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const [bootRes, sessRes] = await Promise.all([
          fetch('/api/bootstrap'),
          fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'member' }),
          }),
        ]);
        const bootData = (await bootRes.json()) as LibraryBootstrapPayload;
        const sessData = (await sessRes.json()) as SessionInfo;
        if (!active) return;
        applySyncPayload(bootData);
        setSession(sessData);
      } catch {
        if (active) pushToast('error', 'Gagal memuat data perpustakaan dari server.');
      } finally {
        if (active) setLoading(false);
      }
    }

    init();

    const evtSource = new EventSource('/api/events');
    evtSource.onopen = () => {
      if (active) setSseConnected(true);
    };
    evtSource.onerror = () => {
      if (active) setSseConnected(false);
    };
    evtSource.addEventListener('presence', (event) => {
      if (!active) return;
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as {
          connectedClients: number;
        };
        setConnectedClients(parsed.connectedClients);
      } catch {
        // Ignore malformed presence frame
      }
    });
    evtSource.addEventListener('sync', (event) => {
      if (!active) return;
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as LibraryBootstrapPayload;
        applySyncPayload(parsed);
      } catch {
        // Ignore malformed sync frame
      }
    });

    return () => {
      active = false;
      evtSource.close();
    };
  }, [applySyncPayload, pushToast]);

  const apiCall = useCallback(
    async <T extends { sync?: LibraryBootstrapPayload }>(
      url: string,
      options: RequestInit = {}
    ): Promise<T> => {
      if (!session?.token) {
        throw new Error('Sesi belum aktif.');
      }
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          ...(options.headers || {}),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Terjadi kesalahan pada server.');
      }
      if (data.sync) {
        applySyncPayload(data.sync as LibraryBootstrapPayload);
      }
      return data as T;
    },
    [session, applySyncPayload]
  );

  // Action handlers
  async function handleCreateBook(
    payload: Omit<Book, 'id' | 'availableCopies' | 'coverUrl' | 'borrowCount' | 'createdAt'>
  ) {
    try {
      await apiCall('/api/books', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      pushToast('success', `Koleksi "${payload.title}" berhasil ditambahkan.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal menambah buku.');
      throw err;
    }
  }

  async function handleUpdateBook(id: string, payload: Partial<Book>) {
    try {
      await apiCall(`/api/books/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      pushToast('success', 'Data koleksi berhasil diperbarui.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal memperbarui buku.');
      throw err;
    }
  }

  async function handleDeleteBook(id: string) {
    try {
      await apiCall(`/api/books/${id}`, { method: 'DELETE' });
      pushToast('success', 'Koleksi buku berhasil dihapus.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal menghapus buku.');
    }
  }

  async function handleCreateLoan(payload: {
    bookId: string;
    memberId: string;
    durationDays: 7 | 14;
  }) {
    try {
      await apiCall('/api/loans', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      pushToast('success', 'Peminjaman buku berhasil dicatat.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal memproses peminjaman.');
      throw err;
    }
  }

  async function handleReturnLoan(loanId: string) {
    try {
      await apiCall(`/api/loans/${loanId}/return`, { method: 'POST' });
      pushToast('success', 'Pengembalian buku berhasil dikonfirmasi.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal mengembalikan buku.');
    }
  }

  async function handleExtendLoan(loanId: string) {
    try {
      await apiCall(`/api/loans/${loanId}/extend`, { method: 'POST' });
      pushToast('success', 'Masa pinjam diperpanjang 7 hari.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal memperpanjang pinjaman.');
    }
  }

  async function handlePayFine(loanId: string) {
    try {
      await apiCall(`/api/loans/${loanId}/pay-fine`, { method: 'POST' });
      pushToast('success', 'Denda keterlambatan ditandai lunas.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal memproses pelunasan denda.');
    }
  }

  async function handleReserveBook(payload: { bookId: string; memberId: string }) {
    try {
      await apiCall('/api/reservations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      pushToast('success', 'Anda berhasil masuk ke antrean reservasi buku.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal membuat reservasi.');
      throw err;
    }
  }

  async function handleCancelReservation(reservationId: string) {
    try {
      await apiCall(`/api/reservations/${reservationId}`, { method: 'DELETE' });
      pushToast('success', 'Antrean reservasi dibatalkan.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal membatalkan reservasi.');
    }
  }

  async function handleToggleBookmark(memberId: string, bookId: string) {
    try {
      const res = await apiCall<{ saved: boolean; sync?: LibraryBootstrapPayload }>(
        `/api/members/${memberId}/bookmarks`,
        {
          method: 'POST',
          body: JSON.stringify({ bookId }),
        }
      );
      pushToast(
        'success',
        res.saved ? 'Buku disimpan ke daftar bacaan.' : 'Buku dihapus dari daftar bacaan.'
      );
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal memperbarui daftar bacaan.');
    }
  }

  async function handleSubmitReview(
    bookId: string,
    payload: { rating: number; comment: string }
  ) {
    try {
      await apiCall(`/api/books/${bookId}/reviews`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      pushToast('success', 'Terima kasih, ulasan Anda telah dipublikasikan.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal mengirim ulasan.');
      throw err;
    }
  }

  async function handleCreateMember(payload: {
    name: string;
    email: string;
    department: string;
    memberCode?: string;
    status?: 'active' | 'suspended';
  }) {
    try {
      await apiCall('/api/members', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      pushToast('success', `Anggota "${payload.name}" berhasil ditambahkan.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal mendaftarkan anggota.');
      throw err;
    }
  }

  async function handleUpdateMember(
    memberId: string,
    payload: {
      name: string;
      email: string;
      department: string;
      status: 'active' | 'suspended';
    }
  ) {
    try {
      await apiCall(`/api/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      pushToast('success', `Data anggota "${payload.name}" berhasil diperbarui.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal memperbarui anggota.');
      throw err;
    }
  }

  async function handleDeleteMember(memberId: string) {
    try {
      await apiCall(`/api/members/${memberId}`, { method: 'DELETE' });
      pushToast('success', 'Data anggota berhasil dihapus.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal menghapus anggota.');
      throw err;
    }
  }

  async function handleToggleMemberStatus(
    memberId: string,
    status: 'active' | 'suspended'
  ) {
    try {
      await apiCall(`/api/members/${memberId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      pushToast(
        'success',
        status === 'active'
          ? 'Status anggota diaktifkan kembali.'
          : 'Status anggota ditangguhkan.'
      );
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal mengubah status anggota.');
    }
  }

  async function handleGenerateReport(kind: ReportKind) {
    try {
      await apiCall('/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify({ kind }),
      });
      pushToast('success', `Laporan ${kind} berhasil dibuat.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal membuat laporan.');
    }
  }

  async function handleUpdateSchedule(payload: {
    enabled: boolean;
    frequency: ReportFrequency;
    runHour: number;
  }) {
    try {
      await apiCall('/api/reports/schedule', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      pushToast('success', 'Jadwal pelaporan otomatis berhasil disimpan.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal menyimpan jadwal.');
    }
  }

  const currentRole: UserRole = session?.role ?? 'member';
  const currentMember =
    members.find((m) => m.id === session?.userId) ?? members[0] ?? null;

  const adminNavItems: Array<{ id: AdminTab; label: string; icon: typeof BarChart3 }> = [
    { id: 'overview', label: 'Ringkasan & Statistik', icon: BarChart3 },
    { id: 'collections', label: 'Manajemen Koleksi', icon: BookCopy },
    { id: 'circulation', label: 'Sirkulasi & Antrean', icon: ArrowLeftRight },
    { id: 'members', label: 'Manajemen Anggota', icon: Users },
    { id: 'barcodes', label: 'Plugin Barcode Buku', icon: ScanBarcode },
    { id: 'reports', label: 'Pelaporan Otomatis', icon: FileSpreadsheet },
  ];

  const memberNavItems: Array<{ id: MemberTab; label: string; icon: typeof BookOpen }> = [
    { id: 'catalog', label: 'Katalog Pustaka', icon: BookOpen },
    { id: 'my-loans', label: 'Pinjaman & Reservasi', icon: Activity },
    { id: 'history', label: 'Riwayat & Statistik', icon: History },
  ];

  const breadcrumbLabel =
    currentRole === 'admin'
      ? `Dashboard Admin / ${adminNavItems.find((i) => i.id === adminTab)?.label ?? ''}`
      : `Portal Anggota / ${memberNavItems.find((i) => i.id === memberTab)?.label ?? ''}`;

  if (loading || !stats) {
    return (
      <div className="min-h-screen bg-[#F6F7FA] dark:bg-[#0B0F17] flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="h-6 w-40 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-32 bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl animate-pulse" />
          <div className="h-24 bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7FA] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex">
      {/* Skip-to-Content Keyboard Accessibility Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-900 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Langsung ke konten utama
      </a>

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      {/* Sidebar Navigation (264px) */}
      <aside
        aria-label="Navigasi Utama"
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-[264px] shrink-0 bg-white dark:bg-[#111723] border-r border-slate-200/90 dark:border-slate-800/90 flex flex-col justify-between transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          {/* Brand Zone */}
          <div className="h-16 px-5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1A2B5E] dark:bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Library className="w-4 h-4" />
              </div>
              <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50 whitespace-nowrap">
                Kazyfi Library
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Tutup menu navigasi"
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Role Switcher */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 space-y-3">
            <div>
              <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-2">
                Mode Portal
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200/60 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    if (currentRole !== 'admin') {
                      setAdminLoginOpen(true);
                    }
                  }}
                  className={`py-1.5 px-2.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                    currentRole === 'admin'
                      ? 'bg-white dark:bg-[#1B2436] text-indigo-950 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {currentRole !== 'admin' && <Lock className="w-3 h-3 opacity-65" />}
                  <span>Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentRole === 'admin') {
                      handleLogoutAdmin();
                    } else {
                      switchSession('member', currentMember?.id ?? members[0]?.id);
                    }
                  }}
                  className={`py-1.5 px-2.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                    currentRole === 'member'
                      ? 'bg-white dark:bg-[#1B2436] text-indigo-950 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Anggota
                </button>
              </div>
            </div>

            {currentRole === 'member' && members.length > 0 && (
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Akun Anggota Aktif
                </label>
                <select
                  value={currentMember?.id ?? ''}
                  onChange={(e) => switchSession('member', e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-700"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.memberCode})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Primary Navigation */}
          <nav className="p-3 space-y-1">
            {currentRole === 'admin'
              ? adminNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = adminTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setAdminTab(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-200 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-950 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active
                            ? 'text-indigo-800 dark:text-indigo-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })
              : memberNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = memberTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMemberTab(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-200 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-950 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active
                            ? 'text-indigo-800 dark:text-indigo-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
          </nav>
        </div>

        {/* Bottom Inclusive Accessibility Trigger & Active Identity */}
        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <button
            type="button"
            onClick={() => setA11yOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200/90 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-indigo-800 dark:text-indigo-400" />
              <span>Aksesibilitas & Tema</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {a11yPrefs.theme === 'dark' ? 'Gelap' : 'Terang'}
            </span>
          </button>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                {currentRole === 'admin' ? (
                  <ShieldCheck className="w-4 h-4 text-indigo-800 dark:text-indigo-400" />
                ) : (
                  <User className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {session?.name ?? 'Memuat...'}
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  {session?.code ?? ''}
                </div>
              </div>
            </div>
            {currentRole === 'admin' && (
              <button
                type="button"
                onClick={handleLogoutAdmin}
                aria-label="Keluar dari sesi Admin"
                title="Keluar Admin"
                className="p-2 rounded-lg text-slate-500 hover:text-red-700 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="h-16 bg-white/95 dark:bg-[#111723]/95 backdrop-blur-xs border-b border-slate-200/90 dark:border-slate-800/90 px-4 sm:px-8 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
              {breadcrumbLabel}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {currentRole === 'admin' ? (
              <>
                <button
                  type="button"
                  onClick={() => setAdminTab('reports')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Lihat Laporan ({reports.length})
                </button>
                <button
                  type="button"
                  onClick={handleLogoutAdmin}
                  className="px-3.5 py-2 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50/80 dark:bg-red-950/40 border border-red-200/90 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar Admin</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMemberTab('my-loans')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Pinjaman Aktif (
                  {
                    loans.filter(
                      (l) =>
                        l.memberId === currentMember?.id && l.status !== 'returned'
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setAdminLoginOpen(true)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Login Admin</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main id="main-content" className="flex-1 p-5 sm:p-8 max-w-7xl w-full mx-auto">
          {currentRole === 'admin' ? (
            <AdminDashboard
              activeTab={adminTab}
              books={books}
              members={members}
              loans={loans}
              reservations={reservations}
              activities={activities}
              reports={reports}
              reportSchedule={reportSchedule}
              stats={stats}
              sseConnected={sseConnected}
              connectedClients={connectedClients}
              authToken={session?.token ?? ''}
              onCreateBook={handleCreateBook}
              onUpdateBook={handleUpdateBook}
              onDeleteBook={handleDeleteBook}
              onCreateLoan={handleCreateLoan}
              onReturnLoan={handleReturnLoan}
              onExtendLoan={handleExtendLoan}
              onPayFine={handlePayFine}
              onCancelReservation={handleCancelReservation}
              onCreateMember={handleCreateMember}
              onUpdateMember={handleUpdateMember}
              onDeleteMember={handleDeleteMember}
              onToggleMemberStatus={handleToggleMemberStatus}
              onGenerateReport={handleGenerateReport}
              onUpdateSchedule={handleUpdateSchedule}
              onNavigateTab={setAdminTab}
            />
          ) : currentMember ? (
            <MemberDashboard
              activeTab={memberTab}
              currentMember={currentMember}
              books={books}
              loans={loans}
              reservations={reservations}
              reviews={reviews}
              sseConnected={sseConnected}
              onBorrowBook={handleCreateLoan}
              onReturnLoan={handleReturnLoan}
              onExtendLoan={handleExtendLoan}
              onReserveBook={handleReserveBook}
              onCancelReservation={handleCancelReservation}
              onToggleBookmark={handleToggleBookmark}
              onSubmitReview={handleSubmitReview}
              onNavigateTab={setMemberTab}
            />
          ) : null}
        </main>
      </div>

      {/* Accessibility Modal */}
      <AccessibilityModal
        open={a11yOpen}
        prefs={a11yPrefs}
        onChange={setA11yPrefs}
        onClose={() => setA11yOpen(false)}
      />

      {/* Admin Login / Setup Modal */}
      <AdminLoginModal
        open={adminLoginOpen}
        onClose={() => setAdminLoginOpen(false)}
        onSuccess={handleAdminAuthenticated}
      />

      {/* Toast Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm no-print"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg border text-sm font-medium shadow-lg ${
              t.kind === 'error'
                ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'
                : 'bg-slate-900 dark:bg-slate-100 border-slate-800 dark:border-slate-200 text-white dark:text-slate-900'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
