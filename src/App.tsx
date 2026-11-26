import {
  ArrowLeftRight,
  BarChart3,
  BookCopy,
  Clock,
  Eye,
  FileSpreadsheet,
  History,
  Library,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Menu,
  ScanBarcode,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityModal } from './components/AccessibilityModal';
import { AdminDashboard, type AdminTab } from './components/AdminDashboard';
import { AdminLoginModal } from './components/AdminLoginModal';
import type { SubmitFineProofPayload } from './components/FinePaymentModal';
import { HoverPop } from './components/HoverPop';
import { MemberAuthModal, type MemberAuthMode } from './components/MemberAuthModal';
import { MemberDashboard, type MemberTab } from './components/MemberDashboard';
import { formatRupiah } from './utils/format';
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
  const [mobilePortalMenuOpen, setMobilePortalMenuOpen] = useState(false);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [memberAuthModal, setMemberAuthModal] = useState<{
    open: boolean;
    mode: MemberAuthMode;
  }>({ open: false, mode: 'login' });

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
  const [memberTab, setMemberTab] = useState<MemberTab>('home');
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

  const openMemberAuth = useCallback((mode: MemberAuthMode = 'login') => {
    setMobilePortalMenuOpen(false);
    setMemberAuthModal({ open: true, mode });
  }, []);

  const handleMemberAuthenticated = useCallback(
    (memberSession: SessionInfo, syncPayload?: LibraryBootstrapPayload) => {
      if (syncPayload) {
        applySyncPayload(syncPayload);
      }
      setSession(memberSession);
      setMemberAuthModal((prev) => ({ ...prev, open: false }));
      setMobilePortalMenuOpen(false);
      pushToast(
        'success',
        `Selamat datang, ${memberSession.name} (${memberSession.code}).`
      );
    },
    [applySyncPayload, pushToast]
  );

  const handleLogoutMember = useCallback(() => {
    setSession(null);
    setMemberTab((prev) => (prev === 'my-loans' || prev === 'history' ? 'home' : prev));
    setMobilePortalMenuOpen(false);
    pushToast('success', 'Anda telah keluar dari akun anggota.');
  }, [pushToast]);

  const handleAdminAuthenticated = useCallback(
    (adminSession: SessionInfo) => {
      setSession(adminSession);
      setAdminTab('overview');
      setAdminLoginOpen(false);
      setSidebarOpen(false);
      setMobilePortalMenuOpen(false);
      pushToast('success', `Selamat datang, ${adminSession.name} (Admin Kazyfi Library).`);
    },
    [pushToast]
  );

  const handleLogoutAdmin = useCallback(() => {
    setSession(null);
    setMemberTab('home');
    setSidebarOpen(false);
    setMobilePortalMenuOpen(false);
    pushToast('success', 'Anda telah keluar dari sesi Admin.');
  }, [pushToast]);

  // Initial load (Guest mode until member or admin logs in) + SSE live subscription
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const bootRes = await fetch('/api/bootstrap');
        const bootData = (await bootRes.json()) as LibraryBootstrapPayload;
        if (!active) return;
        applySyncPayload(bootData);
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
    payload: Omit<Book, 'id' | 'availableCopies' | 'coverUrl' | 'borrowCount' | 'createdAt'> & {
      coverUrl?: string;
    }
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
      throw err;
    }
  }

  async function handleSubmitFineProof(loanId: string, payload: SubmitFineProofPayload) {
    try {
      await apiCall(`/api/loans/${loanId}/submit-fine-proof`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      pushToast(
        'success',
        'Bukti pembayaran denda berhasil dikirim. Menunggu verifikasi Admin.'
      );
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal mengirim bukti pembayaran.');
      throw err;
    }
  }

  async function handleRejectFineProof(loanId: string, reason: string) {
    try {
      await apiCall(`/api/loans/${loanId}/reject-fine-proof`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      pushToast('success', 'Bukti pembayaran ditandai perlu diperbarui oleh anggota.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal menolak bukti pembayaran.');
      throw err;
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
  const authenticatedMember =
    session?.role === 'member'
      ? members.find((m) => m.id === session.userId) ?? null
      : null;

  const activeLoanCount = authenticatedMember
    ? loans.filter(
        (l) => l.memberId === authenticatedMember.id && l.status !== 'returned'
      ).length
    : 0;

  const unpaidFineTotal = authenticatedMember
    ? loans
        .filter(
          (l) =>
            l.memberId === authenticatedMember.id &&
            l.fineAmount > 0 &&
            !l.finePaid
        )
        .reduce((sum, l) => sum + l.fineAmount, 0)
    : 0;

  const adminNavItems: Array<{
    id: AdminTab;
    label: string;
    hint: string;
    icon: typeof BarChart3;
  }> = [
    {
      id: 'overview',
      label: 'Ringkasan & Statistik',
      hint: 'Pantau KPI koleksi, tingkat utilisasi, tren harian, dan log aktivitas real-time.',
      icon: BarChart3,
    },
    {
      id: 'collections',
      label: 'Manajemen Koleksi',
      hint: 'Tambah, ubah, atur 14 kategori ilmu, dan unggah sampul buku koleksi pustaka.',
      icon: BookCopy,
    },
    {
      id: 'circulation',
      label: 'Sirkulasi & Antrean',
      hint: 'Kelola peminjaman, pengembalian, antrean reservasi, dan verifikasi bukti QRIS/Bank.',
      icon: ArrowLeftRight,
    },
    {
      id: 'members',
      label: 'Manajemen Anggota',
      hint: 'Daftarkan anggota baru, sunting profil, ubah status, atau hapus keanggotaan.',
      icon: Users,
    },
    {
      id: 'barcodes',
      label: 'Plugin Barcode Buku',
      hint: 'Buat dan cetak stiker barcode Code-128 & ISBN untuk pelabelan fisik koleksi.',
      icon: ScanBarcode,
    },
    {
      id: 'reports',
      label: 'Pelaporan Otomatis',
      hint: 'Hasilkan laporan periodik sirkulasi, koleksi, dan ekspor arsip administrasi.',
      icon: FileSpreadsheet,
    },
  ];

  const memberPortalNavItems: Array<{
    id: MemberTab;
    label: string;
    subtitle: string;
    detail: string;
    isLocked?: boolean;
  }> = [
    {
      id: 'home',
      label: 'Beranda',
      subtitle: 'Halaman Utama Portal',
      detail: 'OneSearch terpadu, pintasan platform layanan, dan sorotan koleksi terpopuler.',
    },
    {
      id: 'catalog',
      label: 'Katalog OPAC',
      subtitle: `${books.length} Judul · 14 Bidang Ilmu`,
      detail: 'Telusuri stok eksemplar real-time, kartu anggota digital, dan ajukan peminjaman.',
    },
    {
      id: 'reading-room',
      label: 'Ruang Baca',
      subtitle: 'Ruang Baca Virtual (RBV)',
      detail: 'Baca pratinjau bab pembuka dan dengarkan narasi audio Bahasa Indonesia.',
    },
    {
      id: 'my-loans',
      label: 'Pinjaman Saya',
      isLocked: !authenticatedMember,
      subtitle: authenticatedMember
        ? `${activeLoanCount}/3 Pinjaman Aktif`
        : 'Perlu Login Anggota',
      detail: !authenticatedMember
        ? 'Halaman khusus anggota yang sudah masuk. Silakan login atau daftar untuk melihat pinjaman, reservasi, dan pembayaran denda.'
        : unpaidFineTotal > 0
        ? `Perpanjang pinjaman atau lunasi denda ${formatRupiah(unpaidFineTotal)} via Bank/QRIS.`
        : 'Pantau tenggat waktu, perpanjangan, antrean reservasi, dan status denda.',
    },
    {
      id: 'profile',
      label: 'Profil & Layanan',
      subtitle: 'Informasi & Tata Tertib',
      detail: 'Ketentuan sirkulasi, tarif denda keterlambatan, jam buka, dan kontak bantuan.',
    },
  ];

  const adminBreadcrumbLabel = `Dashboard Admin / ${
    adminNavItems.find((i) => i.id === adminTab)?.label ?? ''
  }`;

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
    <div className="min-h-screen bg-[#F6F7FA] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* Skip-to-Content Keyboard Accessibility Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-900 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Langsung ke konten utama
      </a>

      {currentRole === 'admin' ? (
        <div className="min-h-screen flex">
          {/* Mobile Sidebar Backdrop */}
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-xs z-30 lg:hidden"
            />
          )}

          {/* Admin Sidebar Navigation (264px) */}
          <aside
            aria-label="Navigasi Admin"
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
                      className="py-1.5 px-2.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer inline-flex items-center justify-center gap-1.5 bg-white dark:bg-[#1B2436] text-indigo-950 dark:text-white shadow-xs"
                    >
                      <span>Admin</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLogoutAdmin}
                      className="py-1.5 px-2.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    >
                      Portal Publik
                    </button>
                  </div>
                </div>
              </div>

              {/* Admin Primary Navigation */}
              <nav className="p-3 space-y-1">
                {adminNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = adminTab === item.id;
                  return (
                    <HoverPop
                      key={item.id}
                      placement="right"
                      widthClass="w-64"
                      content={
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                            {item.label}
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item.hint}
                          </p>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setAdminTab(item.id);
                          setSidebarOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm rounded-lg transition-colors whitespace-nowrap cursor-pointer hover-pop-subtle ${
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
                    </HoverPop>
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
                    <ShieldCheck className="w-4 h-4 text-indigo-800 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {session?.name ?? 'Admin'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {session?.code ?? ''}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogoutAdmin}
                  aria-label="Keluar dari sesi Admin"
                  title="Keluar Admin"
                  className="p-2 rounded-lg text-slate-500 hover:text-red-700 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>

          {/* Admin Main Content Area */}
          <div className="flex-1 min-w-0 flex flex-col">
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
                  {adminBreadcrumbLabel}
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
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
              </div>
            </header>

            <main id="main-content" className="flex-1 p-5 sm:p-8 max-w-7xl w-full mx-auto">
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
                onRejectFineProof={handleRejectFineProof}
                onCancelReservation={handleCancelReservation}
                onCreateMember={handleCreateMember}
                onUpdateMember={handleUpdateMember}
                onDeleteMember={handleDeleteMember}
                onToggleMemberStatus={handleToggleMemberStatus}
                onGenerateReport={handleGenerateReport}
                onUpdateSchedule={handleUpdateSchedule}
                onNavigateTab={setAdminTab}
              />
            </main>
          </div>
        </div>
      ) : (
        /* Academic Library Portal Layout (inspired by pustaka.ut.ac.id/lib/) */
        <div className="min-h-screen flex flex-col">
          {/* Zone 1-3 Sticky Top Navigation Header */}
          <header className="h-16 bg-white/95 dark:bg-[#111723]/95 backdrop-blur-xs border-b border-slate-200/90 dark:border-slate-800/90 sticky top-0 z-30">
            <div className="max-w-7xl mx-auto h-full px-4 sm:px-8 flex items-center justify-between gap-6">
              {/* Zone 1: Institutional Brand */}
              <button
                type="button"
                onClick={() => {
                  setMemberTab('home');
                  setMobilePortalMenuOpen(false);
                }}
                className="flex items-center gap-3 shrink-0 cursor-pointer text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-[#1A2B5E] dark:bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Library className="w-4 h-4" />
                </div>
                <div className="whitespace-nowrap">
                  <div className="font-display text-[17px] font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50 leading-tight">
                    Kazyfi Library
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-tight hidden sm:block">
                    Portal Perpustakaan Digital
                  </div>
                </div>
              </button>

              {/* Zone 2: 5-Link Single-Line Portal Navigation */}
              <nav
                aria-label="Navigasi Portal Perpustakaan"
                className="hidden lg:flex items-center gap-6 h-full"
              >
                {memberPortalNavItems.map((item) => {
                  const active = memberTab === item.id;
                  return (
                    <HoverPop
                      key={item.id}
                      as="span"
                      className="inline-flex h-full items-center"
                      placement="bottom"
                      widthClass="w-64"
                      content={
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                              {item.label}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {item.subtitle}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item.detail}
                          </p>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setMemberTab(item.id)}
                        className={`h-full inline-flex items-center gap-1.5 border-b-2 text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer hover-pop-subtle ${
                          active
                            ? 'border-[#1A2B5E] dark:border-indigo-400 text-[#1A2B5E] dark:text-white font-semibold'
                            : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#1A2B5E] dark:hover:text-white font-medium'
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.isLocked && (
                          <Lock
                            className="w-3 h-3 text-slate-400 dark:text-slate-500"
                            aria-label="Memerlukan login anggota"
                          />
                        )}
                      </button>
                    </HoverPop>
                  );
                })}
              </nav>

              {/* Zone 3: Member Auth (Masuk/Daftar/Keluar), Admin Access CTA & Mobile Toggle */}
              <div className="flex items-center gap-2 shrink-0">
                {authenticatedMember ? (
                  <HoverPop
                    as="span"
                    className="inline-flex"
                    placement="bottom"
                    widthClass="w-60"
                    content={
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                          {authenticatedMember.name}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                          Keluar dari sesi anggota {authenticatedMember.memberCode}.
                        </p>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      onClick={handleLogoutMember}
                      className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50/80 dark:bg-red-950/40 border border-red-200/90 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 hover-pop-subtle"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluar</span>
                    </button>
                  </HoverPop>
                ) : (
                  <>
                    <HoverPop
                      as="span"
                      className="inline-flex"
                      placement="bottom"
                      widthClass="w-60"
                      content={
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                            Login Anggota
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            Masuk menggunakan email atau kode anggota untuk meminjam buku dan membuka Pinjaman Saya.
                          </p>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => openMemberAuth('login')}
                        className="px-3 py-1.5 text-xs font-semibold text-[#1A2B5E] dark:text-indigo-200 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 hover-pop-subtle"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Masuk</span>
                      </button>
                    </HoverPop>

                    <HoverPop
                      as="span"
                      className="hidden sm:inline-flex"
                      placement="bottom"
                      widthClass="w-60"
                      content={
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                            Daftar Anggota Baru
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            Buat akun keanggotaan digital Kazyfi Library untuk akses peminjaman dan reservasi.
                          </p>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => openMemberAuth('signup')}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 shadow-xs hover-pop-subtle"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Daftar</span>
                      </button>
                    </HoverPop>
                  </>
                )}

                <HoverPop
                  as="span"
                  className="hidden md:inline-flex"
                  placement="bottom"
                  widthClass="w-64"
                  content={
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                        Portal Pengelola & Pustakawan
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        Masuk ke dashboard admin untuk mengelola koleksi, barcode buku, anggota, dan verifikasi pembayaran QRIS.
                      </p>
                    </div>
                  }
                >
                  <button
                    type="button"
                    onClick={() => setAdminLoginOpen(true)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 hover-pop-subtle"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#1A2B5E] dark:text-indigo-400" />
                    <span>Login Admin</span>
                  </button>
                </HoverPop>

                <button
                  type="button"
                  onClick={() => setMobilePortalMenuOpen((prev) => !prev)}
                  aria-label={mobilePortalMenuOpen ? 'Tutup menu portal' : 'Buka menu portal'}
                  className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {mobilePortalMenuOpen ? (
                    <X className="w-5 h-5" />
                  ) : (
                    <Menu className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </header>

          {/* Mobile Navigation Drawer */}
          {mobilePortalMenuOpen && (
            <div className="lg:hidden bg-white dark:bg-[#111723] border-b border-slate-200 dark:border-slate-800 px-4 py-3 space-y-1 z-20">
              {memberPortalNavItems.map((item) => {
                const active = memberTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setMemberTab(item.id);
                      setMobilePortalMenuOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg text-sm transition-colors cursor-pointer flex items-center justify-between ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-[#1A2B5E] dark:text-indigo-200 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.isLocked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setMemberTab('history');
                  setMobilePortalMenuOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg text-sm transition-colors cursor-pointer flex items-center justify-between ${
                  memberTab === 'history'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-[#1A2B5E] dark:text-indigo-200 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                }`}
              >
                <span>Riwayat & Statistik</span>
                {!authenticatedMember && <Lock className="w-3.5 h-3.5 text-slate-400" />}
              </button>

              <div className="pt-2 mt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap gap-2">
                {authenticatedMember ? (
                  <button
                    type="button"
                    onClick={handleLogoutMember}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Keluar ({authenticatedMember.memberCode})</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openMemberAuth('login')}
                      className="flex-1 px-3 py-2 text-xs font-semibold text-[#1A2B5E] dark:text-indigo-200 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Masuk</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openMemberAuth('signup')}
                      className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-[#1A2B5E] dark:bg-indigo-600 rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Daftar Anggota</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobilePortalMenuOpen(false);
                    setAdminLoginOpen(true);
                  }}
                  className="w-full px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#1A2B5E] dark:text-indigo-400" />
                  <span>Login Admin Pustakawan</span>
                </button>
              </div>
            </div>
          )}

          {/* Compact Member Utility Ribbon */}
          <div className="bg-white/75 dark:bg-[#0E1422] border-b border-slate-200/80 dark:border-slate-800/80">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              {authenticatedMember ? (
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                  <div className="inline-flex items-center gap-2 min-w-0">
                    <User className="w-3.5 h-3.5 text-[#1A2B5E] dark:text-indigo-400 shrink-0" />
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {authenticatedMember.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      ({authenticatedMember.memberCode})
                    </span>
                  </div>

                  <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>

                  <HoverPop
                    as="span"
                    className="inline-flex"
                    placement="bottom"
                    widthClass="w-60"
                    content={
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                          Kuota Pinjaman Anggota
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                          Saat ini aktif {activeLoanCount} dari maksimal 3 buku. Klik untuk kelola perpanjangan atau pengembalian.
                        </p>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setMemberTab('my-loans')}
                      className="font-medium text-slate-700 dark:text-slate-200 hover:text-[#1A2B5E] dark:hover:text-indigo-300 transition-colors tabular-nums whitespace-nowrap cursor-pointer hover-pop-subtle"
                    >
                      Pinjaman Aktif: {activeLoanCount}/3
                    </button>
                  </HoverPop>

                  {unpaidFineTotal > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <HoverPop
                        as="span"
                        className="inline-flex"
                        placement="bottom"
                        widthClass="w-64"
                        content={
                          <div className="space-y-1">
                            <div className="text-xs font-bold text-amber-800 dark:text-amber-300">
                              Tagihan Denda Keterlambatan
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                              Total {formatRupiah(unpaidFineTotal)} dapat dibayar via Transfer Bank atau QRIS dinamis Kazyfi.
                            </p>
                          </div>
                        }
                      >
                        <button
                          type="button"
                          onClick={() => setMemberTab('my-loans')}
                          className="font-semibold text-amber-800 dark:text-amber-300 hover:underline tabular-nums whitespace-nowrap cursor-pointer hover-pop-subtle"
                        >
                          Tagihan Denda: {formatRupiah(unpaidFineTotal)}
                        </button>
                      </HoverPop>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                  <div className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      Pengunjung Tamu ·{' '}
                      <span className="hidden sm:inline">
                        Masuk untuk meminjam buku &amp; mengakses Pinjaman Saya
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openMemberAuth('login')}
                    className="font-semibold text-[#1A2B5E] dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Masuk
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <button
                    type="button"
                    onClick={() => openMemberAuth('signup')}
                    className="font-semibold text-[#1A2B5E] dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Daftar Anggota
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 shrink-0">
                <HoverPop
                  as="span"
                  className="inline-flex"
                  placement="bottom"
                  widthClass="w-60"
                  content={
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                        Statistik & Riwayat Baca
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        {authenticatedMember
                          ? 'Lihat buku yang telah dibaca, persentase ketepatan pengembalian, dan daftar simpanan.'
                          : 'Khusus anggota yang sudah masuk. Login terlebih dahulu untuk melihat riwayat transaksi pribadi.'}
                      </p>
                    </div>
                  }
                >
                  <button
                    type="button"
                    onClick={() => setMemberTab('history')}
                    className={`inline-flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap cursor-pointer hover-pop-subtle ${
                      memberTab === 'history'
                        ? 'text-[#1A2B5E] dark:text-indigo-300 font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:text-[#1A2B5E] dark:hover:text-indigo-300'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Statistik & Riwayat</span>
                    {!authenticatedMember && (
                      <Lock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                    )}
                  </button>
                </HoverPop>

                <span className="text-slate-300 dark:text-slate-700">·</span>

                <HoverPop
                  as="span"
                  className="inline-flex"
                  placement="bottom"
                  widthClass="w-60"
                  content={
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                        Aksesibilitas & Tampilan
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        Atur tema Terang/Gelap, ukuran huruf, kontras tinggi, dan spasi ramah disleksia.
                      </p>
                    </div>
                  }
                >
                  <button
                    type="button"
                    onClick={() => setA11yOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111723] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer hover-pop-subtle"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#1A2B5E] dark:text-indigo-400" />
                    <span>{a11yPrefs.theme === 'dark' ? 'Tema Gelap' : 'Tema Terang'}</span>
                  </button>
                </HoverPop>
              </div>
            </div>
          </div>

          {/* Main Portal Viewport */}
          <main
            id="main-content"
            className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8"
          >
            <MemberDashboard
              activeTab={memberTab}
              currentMember={authenticatedMember}
              books={books}
              loans={loans}
              reservations={reservations}
              reviews={reviews}
              sseConnected={sseConnected}
              onBorrowBook={handleCreateLoan}
              onReturnLoan={handleReturnLoan}
              onExtendLoan={handleExtendLoan}
              onSubmitFineProof={handleSubmitFineProof}
              onReserveBook={handleReserveBook}
              onCancelReservation={handleCancelReservation}
              onToggleBookmark={handleToggleBookmark}
              onSubmitReview={handleSubmitReview}
              onNavigateTab={setMemberTab}
              onOpenAuth={(mode) => openMemberAuth(mode)}
            />
          </main>

          {/* Institutional Academic Footer */}
          <footer className="bg-[#0E1836] dark:bg-[#070B14] text-indigo-100 border-t border-indigo-950/80 mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {/* Col 1: Brand & Mission */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white/15 text-white flex items-center justify-center shrink-0">
                      <Library className="w-4 h-4" />
                    </div>
                    <span className="font-display text-base font-bold text-white tracking-tight">
                      Kazyfi Library
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200/80 leading-relaxed">
                    Portal Perpustakaan Digital & Ruang Baca Virtual Kazyfi Library untuk akses katalog OPAC, referensi akademik lintas disiplin ilmu, dan layanan sirkulasi mandiri.
                  </p>
                </div>

                {/* Col 2: Quick Portal Links */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                    Layanan Portal
                  </h3>
                  <ul className="space-y-2 text-xs text-indigo-200/85">
                    <li>
                      <button
                        type="button"
                        onClick={() => setMemberTab('home')}
                        className="hover:text-white transition-colors cursor-pointer"
                      >
                        Beranda & OneSearch
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setMemberTab('catalog')}
                        className="hover:text-white transition-colors cursor-pointer"
                      >
                        Katalog Pustaka (OPAC)
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setMemberTab('reading-room')}
                        className="hover:text-white transition-colors cursor-pointer"
                      >
                        Ruang Baca Virtual (RBV)
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setMemberTab('my-loans')}
                        className="hover:text-white transition-colors cursor-pointer"
                      >
                        Pinjaman, Reservasi & Pembayaran QRIS
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setMemberTab('profile')}
                        className="hover:text-white transition-colors cursor-pointer"
                      >
                        Profil & Panduan Layanan
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Col 3: Operating Hours */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                    Jam Layanan Pustaka
                  </h3>
                  <ul className="space-y-2 text-xs text-indigo-200/85">
                    <li className="flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
                      <span>Senin – Jumat: 08.00 – 21.00 WIB</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
                      <span>Sabtu: 09.00 – 17.00 WIB</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
                      <span>Portal Digital & RBV: 24 Jam Daring</span>
                    </li>
                  </ul>
                </div>

                {/* Col 4: Contact & Admin Portal */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                    Kontak & Akses Pengelola
                  </h3>
                  <ul className="space-y-2 text-xs text-indigo-200/85">
                    <li className="flex items-start gap-2">
                      <Mail className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
                      <span>layanan@kazyfilibrary.id</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
                      <span>Gedung Pusat Literasi Kazyfi, Jakarta Timur</span>
                    </li>
                  </ul>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setAdminLoginOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium text-white border border-white/15 transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Portal Admin Pustakawan</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-indigo-900/70 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-indigo-200/75">
                <span>© {new Date().getFullYear()} Kazyfi Library. Seluruh layanan informasi pustaka terintegrasi.</span>
                <span className="tabular-nums">
                  {books.length} Judul Koleksi · 14 Bidang Ilmu · Akses Inklusif Terverifikasi
                </span>
              </div>
            </div>
          </footer>
        </div>
      )}

      {/* Accessibility Modal */}
      <AccessibilityModal
        open={a11yOpen}
        prefs={a11yPrefs}
        onChange={setA11yPrefs}
        onClose={() => setA11yOpen(false)}
      />

      {/* Member Auth (Login / Sign Up / Activation) Modal */}
      <MemberAuthModal
        open={memberAuthModal.open}
        initialMode={memberAuthModal.mode}
        onClose={() => setMemberAuthModal((prev) => ({ ...prev, open: false }))}
        onSuccess={handleMemberAuthenticated}
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
