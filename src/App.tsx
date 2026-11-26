import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  BookCopy,
  BookOpen,
  FileSpreadsheet,
  History,
  Library,
  Menu,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AdminDashboard, type AdminTab } from './components/AdminDashboard';
import { MemberDashboard, type MemberTab } from './components/MemberDashboard';
import type {
  ActivityEvent,
  AutomatedReport,
  Book,
  LibraryBootstrapPayload,
  LibraryStatistics,
  Loan,
  Member,
  ReportFrequency,
  ReportKind,
  ReportSchedule,
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

  // Server-authoritative state
  const [books, setBooks] = useState<Book[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
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

  const pushToast = useCallback((kind: 'success' | 'error', text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, kind, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const applySyncPayload = useCallback((data: LibraryBootstrapPayload) => {
    setBooks(data.books);
    setMembers(data.members);
    setLoans(data.loans);
    setActivities(data.activities);
    setReports(data.reports);
    setReportSchedule(data.reportSchedule);
    setStats(data.stats);
    setConnectedClients(data.connectedClients);
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

  // Initial load + Admin default session + SSE live subscription
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const [bootRes, sessRes] = await Promise.all([
          fetch('/api/bootstrap'),
          fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'admin' }),
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

  async function handleCreateMember(payload: {
    name: string;
    email: string;
    department: string;
  }) {
    try {
      await apiCall('/api/members', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      pushToast('success', `Anggota "${payload.name}" berhasil didaftarkan.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Gagal mendaftarkan anggota.');
      throw err;
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

  const currentRole: UserRole = session?.role ?? 'admin';
  const currentMember =
    members.find((m) => m.id === session?.userId) ?? members[0] ?? null;

  const adminNavItems: Array<{ id: AdminTab; label: string; icon: typeof BarChart3 }> = [
    { id: 'overview', label: 'Ringkasan & Statistik', icon: BarChart3 },
    { id: 'collections', label: 'Manajemen Koleksi', icon: BookCopy },
    { id: 'circulation', label: 'Sirkulasi & Anggota', icon: ArrowLeftRight },
    { id: 'reports', label: 'Pelaporan Otomatis', icon: FileSpreadsheet },
  ];

  const memberNavItems: Array<{ id: MemberTab; label: string; icon: typeof BookOpen }> = [
    { id: 'catalog', label: 'Katalog Pustaka', icon: BookOpen },
    { id: 'my-loans', label: 'Pinjaman Saya', icon: Activity },
    { id: 'history', label: 'Riwayat & Statistik', icon: History },
  ];

  const breadcrumbLabel =
    currentRole === 'admin'
      ? `Dashboard Admin / ${adminNavItems.find((i) => i.id === adminTab)?.label ?? ''}`
      : `Portal Anggota / ${memberNavItems.find((i) => i.id === memberTab)?.label ?? ''}`;

  if (loading || !stats) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="h-6 w-40 bg-slate-200 rounded animate-pulse" />
          <div className="h-32 bg-white border border-slate-200 rounded-lg animate-pulse" />
          <div className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
        />
      )}

      {/* Sidebar Navigation (260px) */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          {/* Brand Zone */}
          <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Library className="w-5 h-5 text-blue-700 shrink-0" />
              <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
                PustakaLoka
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Role Switcher */}
          <div className="p-4 border-b border-slate-100">
            <div className="text-[11px] font-medium text-slate-400 mb-2">
              Mode Dashboard
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => switchSession('admin')}
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  currentRole === 'admin'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() =>
                  switchSession('member', currentMember?.id ?? members[0]?.id)
                }
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  currentRole === 'member'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Anggota
              </button>
            </div>

            {currentRole === 'member' && members.length > 0 && (
              <div className="mt-3">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Akun Anggota Aktif
                </label>
                <select
                  value={currentMember?.id ?? ''}
                  onChange={(e) => switchSession('member', e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-600"
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
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-blue-50 text-blue-800'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-blue-700' : 'text-slate-400'
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
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-blue-50 text-blue-800'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-blue-700' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
          </nav>
        </div>

        {/* Active Identity Footer */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
              {currentRole === 'admin' ? (
                <ShieldCheck className="w-4 h-4 text-blue-700" />
              ) : (
                <User className="w-4 h-4 text-slate-700" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {session?.name ?? 'Memuat...'}
              </div>
              <div className="text-xs font-mono text-slate-500 truncate">
                {session?.code ?? ''}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-slate-600 truncate">
              {breadcrumbLabel}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {currentRole === 'admin' ? (
              <button
                type="button"
                onClick={() => setAdminTab('reports')}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Lihat Laporan ({reports.length})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMemberTab('my-loans')}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {currentRole === 'admin' ? (
            <AdminDashboard
              activeTab={adminTab}
              books={books}
              members={members}
              loans={loans}
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
              onCreateMember={handleCreateMember}
              onGenerateReport={handleGenerateReport}
              onUpdateSchedule={handleUpdateSchedule}
            />
          ) : currentMember ? (
            <MemberDashboard
              activeTab={memberTab}
              currentMember={currentMember}
              books={books}
              loans={loans}
              sseConnected={sseConnected}
              onBorrowBook={handleCreateLoan}
              onReturnLoan={handleReturnLoan}
              onExtendLoan={handleExtendLoan}
              onNavigateTab={setMemberTab}
            />
          ) : null}
        </main>
      </div>

      {/* Toast Stack */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg border text-sm font-medium shadow-lg ${
              t.kind === 'error'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
