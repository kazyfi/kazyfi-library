import {
  AlertTriangle,
  ArrowUpRight,
  BookPlus,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  ActivityEvent,
  AutomatedReport,
  Book,
  BookCategory,
  LibraryStatistics,
  Loan,
  Member,
  ReportFrequency,
  ReportKind,
  ReportSchedule,
} from '../types/library';
import {
  formatDateId,
  formatDateTimeId,
  formatRelativeTimeId,
  formatRupiah,
  getDueCountdownText,
} from '../utils/format';
import { BookCover } from './BookCover';
import { CirculationChart } from './CirculationChart';

export type AdminTab = 'overview' | 'collections' | 'circulation' | 'reports';

interface AdminDashboardProps {
  activeTab: AdminTab;
  books: Book[];
  members: Member[];
  loans: Loan[];
  activities: ActivityEvent[];
  reports: AutomatedReport[];
  reportSchedule: ReportSchedule;
  stats: LibraryStatistics;
  sseConnected: boolean;
  connectedClients: number;
  authToken: string;
  onCreateBook: (payload: Omit<Book, 'id' | 'availableCopies' | 'coverUrl' | 'borrowCount' | 'createdAt'>) => Promise<void>;
  onUpdateBook: (id: string, payload: Partial<Book>) => Promise<void>;
  onDeleteBook: (id: string) => Promise<void>;
  onCreateLoan: (payload: { bookId: string; memberId: string; durationDays: 7 | 14 }) => Promise<void>;
  onReturnLoan: (loanId: string) => Promise<void>;
  onExtendLoan: (loanId: string) => Promise<void>;
  onCreateMember: (payload: { name: string; email: string; department: string }) => Promise<void>;
  onGenerateReport: (kind: ReportKind) => Promise<void>;
  onUpdateSchedule: (payload: { enabled: boolean; frequency: ReportFrequency; runHour: number }) => Promise<void>;
}

const CATEGORIES: BookCategory[] = [
  'Filsafat & Sejarah',
  'Arsitektur & Desain',
  'Teknologi & Data',
  'Sastra & Fiksi',
  'Ekonomi & Bisnis',
  'Sains & Astronomi',
];

export function AdminDashboard({
  activeTab,
  books,
  members,
  loans,
  activities,
  reports,
  reportSchedule,
  stats,
  sseConnected,
  connectedClients,
  authToken,
  onCreateBook,
  onUpdateBook,
  onDeleteBook,
  onCreateLoan,
  onReturnLoan,
  onExtendLoan,
  onCreateMember,
  onGenerateReport,
  onUpdateSchedule,
}: AdminDashboardProps) {
  // Collections state
  const [bookSearch, setBookSearch] = useState('');
  const [bookCategoryFilter, setBookCategoryFilter] = useState<string>('all');
  const [bookStockFilter, setBookStockFilter] = useState<'all' | 'available' | 'low' | 'empty'>('all');
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookForm, setBookForm] = useState({
    title: '',
    author: '',
    isbn: '',
    publisher: '',
    year: 2025,
    category: 'Teknologi & Data' as BookCategory,
    shelfCode: 'RAK-C1',
    totalCopies: 3,
    synopsis: '',
  });
  const [bookSubmitting, setBookSubmitting] = useState(false);

  // Circulation state
  const [loanFilter, setLoanFilter] = useState<'all' | 'active' | 'overdue' | 'returned'>('all');
  const [loanSearch, setLoanSearch] = useState('');
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [newLoanForm, setNewLoanForm] = useState({
    bookId: books.find((b) => b.availableCopies > 0)?.id ?? '',
    memberId: members[0]?.id ?? '',
    durationDays: 7 as 7 | 14,
  });
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', email: '', department: '' });
  const [submittingActionId, setSubmittingActionId] = useState<string | null>(null);

  // Reports state
  const [selectedReportId, setSelectedReportId] = useState<string>(reports[0]?.id ?? '');
  const [scheduleDraft, setScheduleDraft] = useState({
    enabled: reportSchedule.enabled,
    frequency: reportSchedule.frequency,
    runHour: reportSchedule.runHour,
  });
  const [reportBusy, setReportBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filteredBooks = useMemo(() => {
    const q = bookSearch.trim().toLowerCase();
    return books.filter((b) => {
      const matchesSearch =
        !q ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.isbn.toLowerCase().includes(q);
      const matchesCategory = bookCategoryFilter === 'all' || b.category === bookCategoryFilter;
      const matchesStock =
        bookStockFilter === 'all'
          ? true
          : bookStockFilter === 'available'
          ? b.availableCopies > 0
          : bookStockFilter === 'low'
          ? b.availableCopies > 0 && b.availableCopies <= 1
          : b.availableCopies === 0;
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [books, bookSearch, bookCategoryFilter, bookStockFilter]);

  const filteredLoans = useMemo(() => {
    const q = loanSearch.trim().toLowerCase();
    return loans.filter((l) => {
      const matchesFilter = loanFilter === 'all' || l.status === loanFilter;
      const matchesSearch =
        !q ||
        l.loanCode.toLowerCase().includes(q) ||
        l.bookTitle.toLowerCase().includes(q) ||
        l.memberName.toLowerCase().includes(q) ||
        l.memberCode.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [loans, loanFilter, loanSearch]);

  const selectedReport =
    reports.find((r) => r.id === selectedReportId) ?? reports[0] ?? null;

  function openAddBookModal() {
    setEditingBook(null);
    setBookForm({
      title: '',
      author: '',
      isbn: `978-623-${Math.floor(100 + Math.random() * 899)}-${Math.floor(100 + Math.random() * 899)}-1`,
      publisher: 'Pustaka Cendekia',
      year: 2025,
      category: 'Teknologi & Data',
      shelfCode: 'RAK-C1',
      totalCopies: 3,
      synopsis: '',
    });
    setBookModalOpen(true);
  }

  function openEditBookModal(book: Book) {
    setEditingBook(book);
    setBookForm({
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      publisher: book.publisher,
      year: book.year,
      category: book.category,
      shelfCode: book.shelfCode,
      totalCopies: book.totalCopies,
      synopsis: book.synopsis,
    });
    setBookModalOpen(true);
  }

  async function handleSaveBook(e: React.FormEvent) {
    e.preventDefault();
    setBookSubmitting(true);
    try {
      if (editingBook) {
        await onUpdateBook(editingBook.id, bookForm);
      } else {
        await onCreateBook(bookForm);
      }
      setBookModalOpen(false);
    } finally {
      setBookSubmitting(false);
    }
  }

  async function handleSaveLoan(e: React.FormEvent) {
    e.preventDefault();
    if (!newLoanForm.bookId || !newLoanForm.memberId) return;
    setSubmittingActionId('create-loan');
    try {
      await onCreateLoan(newLoanForm);
      setLoanModalOpen(false);
    } finally {
      setSubmittingActionId(null);
    }
  }

  async function handleSaveMember(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingActionId('create-member');
    try {
      await onCreateMember(memberForm);
      setMemberForm({ name: '', email: '', department: '' });
      setMemberModalOpen(false);
    } finally {
      setSubmittingActionId(null);
    }
  }

  async function handleDownloadCsv(report: AutomatedReport) {
    setDownloadingId(report.id);
    try {
      const response = await fetch(`/api/reports/${report.id}/csv`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.reportCode}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }

  // =========================================================================
  // TAB 1: OVERVIEW & REAL-TIME STATISTICS
  // =========================================================================
  if (activeTab === 'overview') {
    return (
      <div className="space-y-6">
        {/* Live Connection Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Ringkasan & Pemantauan Real-Time
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Pantau sirkulasi buku, keterlambatan, dan aktivitas transaksi secara langsung.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <Radio
                className={`w-3.5 h-3.5 ${
                  sseConnected ? 'text-emerald-600' : 'text-amber-600'
                }`}
              />
              <span className="font-medium text-slate-800">
                {sseConnected ? 'Aliran Real-Time Terhubung' : 'Menghubungkan ulang...'}
              </span>
            </div>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono tabular-nums text-slate-500">
              {connectedClients} sesi aktif
            </span>
          </div>
        </div>

        {/* 4-Column KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">Total Koleksi Pustaka</p>
            <p className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-2">
              {stats.totalTitles}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
              {stats.availableCopies} dari {stats.totalCopies} eksemplar tersedia
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">Peminjaman Aktif</p>
            <p className="text-3xl font-bold font-mono tabular-nums text-blue-700 mt-2">
              {stats.activeLoansCount}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
              Utilisasi koleksi {stats.utilizationRate}% · {stats.activeMembersCount} anggota aktif
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">Keterlambatan Berjalan</p>
            <p
              className={`text-3xl font-bold font-mono tabular-nums mt-2 ${
                stats.overdueLoansCount > 0 ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {stats.overdueLoansCount}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
              Estimasi denda {formatRupiah(stats.totalOutstandingFines)}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">Ketepatan Pengembalian</p>
            <p className="text-3xl font-bold font-mono tabular-nums text-emerald-700 mt-2">
              {stats.onTimeReturnRate}%
            </p>
            <p className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
              {stats.returnedLoansCount} transaksi selesai tercatat
            </p>
          </div>
        </div>

        {/* 2-Column Split: Circulation Chart + Real-Time Activity Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <CirculationChart data={stats.dailyTrend} />
            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">Rata-rata Harian</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                  {(
                    stats.dailyTrend.reduce((s, d) => s + d.borrowed, 0) / 7
                  ).toFixed(1)}{' '}
                  pinjam/hari
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Total Peminjaman (7H)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                  {stats.dailyTrend.reduce((s, d) => s + d.borrowed, 0)} buku
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Total Pengembalian (7H)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                  {stats.dailyTrend.reduce((s, d) => s + d.returned, 0)} buku
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Aktivitas Transaksi Real-Time
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Log perubahan sirkulasi dan katalog terkini
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {activities.length} entri
              </span>
            </div>

            <div className="divide-y divide-slate-100 overflow-y-auto max-h-72 pr-1">
              {activities.slice(0, 10).map((act) => (
                <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900 leading-snug">
                      {act.summary}
                    </p>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                      {formatRelativeTimeId(act.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {act.actorName} · {act.detail}
                  </p>
                </div>
              ))}
              {activities.length === 0 && (
                <p className="text-sm text-slate-500 py-8 text-center">
                  Belum ada aktivitas transaksi tercatat.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Top Popular Books & Category Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-base font-semibold text-slate-900 mb-4">
              Judul Paling Sering Dipinjam
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="pb-2.5 pr-4">Judul & Penulis</th>
                    <th className="pb-2.5 pr-4">Kategori</th>
                    <th className="pb-2.5 pr-4 text-right">Stok</th>
                    <th className="pb-2.5 text-right">Total Pinjam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {stats.topBooks.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-slate-900">{item.title}</div>
                        <div className="text-xs text-slate-500">{item.author}</div>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-slate-600">{item.category}</td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {item.availableCopies}/{item.totalCopies}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {item.borrowCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-base font-semibold text-slate-900 mb-4">
              Distribusi Peminjaman per Kategori
            </h3>
            <div className="space-y-4">
              {stats.categoryDistribution.map((cat) => {
                const maxBorrow = Math.max(
                  1,
                  ...stats.categoryDistribution.map((c) => c.borrowedCount)
                );
                const pct = Math.round((cat.borrowedCount / maxBorrow) * 100);
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-800">{cat.category}</span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {cat.titles} judul · {cat.borrowedCount} kali dipinjam
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-blue-700 transition-all duration-300"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // TAB 2: COLLECTION MANAGEMENT (CRUD)
  // =========================================================================
  if (activeTab === 'collections') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Manajemen Koleksi Buku
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Kelola katalog pustaka, stok eksemplar, kode rak, dan detail bibliografi.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddBookModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookPlus className="w-4 h-4" />
            <span>Tambah Koleksi</span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-64 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={bookSearch}
              onChange={(e) => setBookSearch(e.target.value)}
              placeholder="Cari judul, penulis, atau ISBN..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={bookCategoryFilter}
              onChange={(e) => setBookCategoryFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-600"
            >
              <option value="all">Semua Kategori</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  ['all', 'Semua'],
                  ['available', 'Tersedia'],
                  ['low', 'Menipis'],
                  ['empty', 'Habis'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBookStockFilter(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    bookStockFilter === key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Collection Table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Buku & Penulis</th>
                  <th className="py-3 px-4">ISBN</th>
                  <th className="py-3 px-4">Kategori & Rak</th>
                  <th className="py-3 px-4 text-right">Tersedia / Total</th>
                  <th className="py-3 px-4 text-right">Dipinjam</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredBooks.map((book) => (
                  <tr key={book.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <BookCover
                          src={book.coverUrl}
                          title={book.title}
                          className="w-10 h-14 rounded-sm shrink-0 border border-slate-200"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate max-w-xs">
                            {book.title}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {book.author} · {book.publisher}, {book.year}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                      {book.isbn}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div className="font-medium text-slate-800">{book.category}</div>
                      <div className="font-mono text-slate-500 mt-0.5">{book.shelfCode}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span
                        className={`font-semibold ${
                          book.availableCopies === 0
                            ? 'text-red-600'
                            : book.availableCopies === 1
                            ? 'text-amber-600'
                            : 'text-emerald-700'
                        }`}
                      >
                        {book.availableCopies}
                      </span>
                      <span className="text-slate-400"> / {book.totalCopies}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {book.borrowCount}x
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditBookModal(book)}
                          title="Edit Buku"
                          className="p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteBook(book.id)}
                          title="Hapus Buku"
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredBooks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-slate-500">
                      Tidak ada koleksi buku yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add/Edit Book Modal */}
        {bookModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingBook ? 'Edit Koleksi Buku' : 'Tambah Koleksi Buku Baru'}
                </h2>
                <button
                  type="button"
                  onClick={() => setBookModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveBook} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Judul Buku
                    </label>
                    <input
                      required
                      type="text"
                      value={bookForm.title}
                      onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Penulis
                    </label>
                    <input
                      required
                      type="text"
                      value={bookForm.author}
                      onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      ISBN
                    </label>
                    <input
                      required
                      type="text"
                      value={bookForm.isbn}
                      onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Kategori
                    </label>
                    <select
                      value={bookForm.category}
                      onChange={(e) =>
                        setBookForm({ ...bookForm, category: e.target.value as BookCategory })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Penerbit
                    </label>
                    <input
                      type="text"
                      value={bookForm.publisher}
                      onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Tahun Terbit
                      </label>
                      <input
                        type="number"
                        min={1900}
                        max={2030}
                        value={bookForm.year}
                        onChange={(e) =>
                          setBookForm({ ...bookForm, year: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Kode Rak
                      </label>
                      <input
                        type="text"
                        value={bookForm.shelfCode}
                        onChange={(e) =>
                          setBookForm({ ...bookForm, shelfCode: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Total Salinan
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={bookForm.totalCopies}
                        onChange={(e) =>
                          setBookForm({ ...bookForm, totalCopies: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Sinopsis Singkat
                    </label>
                    <textarea
                      rows={3}
                      value={bookForm.synopsis}
                      onChange={(e) => setBookForm({ ...bookForm, synopsis: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setBookModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={bookSubmitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    {bookSubmitting ? 'Menyimpan...' : editingBook ? 'Simpan Perubahan' : 'Simpan Buku'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // TAB 3: CIRCULATION & MEMBERS
  // =========================================================================
  if (activeTab === 'circulation') {
    const availableBooks = books.filter((b) => b.availableCopies > 0);
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Sirkulasi Peminjaman & Anggota
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Proses peminjaman, pengembalian, perpanjangan, serta kelola data anggota aktif.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMemberModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Daftarkan Anggota</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNewLoanForm({
                  bookId: availableBooks[0]?.id ?? '',
                  memberId: members[0]?.id ?? '',
                  durationDays: 7,
                });
                setLoanModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Peminjaman</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-64 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={loanSearch}
              onChange={(e) => setLoanSearch(e.target.value)}
              placeholder="Cari kode pinjam, judul buku, atau anggota..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['all', `Semua (${loans.length})`],
                ['active', `Aktif (${loans.filter((l) => l.status === 'active').length})`],
                ['overdue', `Terlambat (${loans.filter((l) => l.status === 'overdue').length})`],
                ['returned', `Selesai (${loans.filter((l) => l.status === 'returned').length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLoanFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  loanFilter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Loans Table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Judul Buku</th>
                  <th className="py-3 px-4">Peminjam</th>
                  <th className="py-3 px-4">Tgl Pinjam</th>
                  <th className="py-3 px-4">Jatuh Tempo</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Denda</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredLoans.map((loan) => (
                  <tr key={loan.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                      {loan.loanCode}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 max-w-xs truncate">
                        {loan.bookTitle}
                      </div>
                      <div className="text-xs text-slate-500">{loan.bookAuthor}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{loan.memberName}</div>
                      <div className="text-xs font-mono text-slate-500">{loan.memberCode}</div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                      {formatDateId(loan.borrowedAt)}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                      <div>{formatDateId(loan.dueAt)}</div>
                      {loan.status !== 'returned' && (
                        <div
                          className={`text-[11px] mt-0.5 ${
                            loan.status === 'overdue' ? 'text-red-600 font-medium' : 'text-slate-400'
                          }`}
                        >
                          {getDueCountdownText(loan.dueAt, loan.status)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs font-medium">
                      {loan.status === 'returned' ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Dikembalikan
                        </span>
                      ) : loan.status === 'overdue' ? (
                        <span className="inline-flex items-center gap-1.5 text-red-600">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Terlambat
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-blue-700">
                          <Clock className="w-3.5 h-3.5" />
                          Dipinjam
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                      <span
                        className={
                          loan.fineAmount > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'
                        }
                      >
                        {formatRupiah(loan.fineAmount)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {loan.status !== 'returned' ? (
                        <div className="inline-flex items-center gap-2">
                          {loan.status === 'active' && loan.extendedCount === 0 && (
                            <button
                              type="button"
                              disabled={submittingActionId === loan.id}
                              onClick={async () => {
                                setSubmittingActionId(loan.id);
                                try {
                                  await onExtendLoan(loan.id);
                                } finally {
                                  setSubmittingActionId(null);
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                            >
                              +7 Hari
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={submittingActionId === loan.id}
                            onClick={async () => {
                              setSubmittingActionId(loan.id);
                              try {
                                await onReturnLoan(loan.id);
                              } finally {
                                setSubmittingActionId(null);
                              }
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md cursor-pointer"
                          >
                            Kembalikan
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-mono text-slate-400">
                          {formatDateId(loan.returnedAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredLoans.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                      Tidak ada transaksi peminjaman pada filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Registered Members Directory */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Daftar Anggota Terdaftar
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {members.length} anggota terdaftar dengan kuota maksimal 3 buku aktif per anggota
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="pb-2.5 pr-4">Kode Anggota</th>
                  <th className="pb-2.5 pr-4">Nama & Email</th>
                  <th className="pb-2.5 pr-4">Departemen / Fakultas</th>
                  <th className="pb-2.5 pr-4 text-right">Pinjaman Aktif</th>
                  <th className="pb-2.5 text-right">Bergabung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => {
                  const activeCount = loans.filter(
                    (l) => l.memberId === m.id && l.status !== 'returned'
                  ).length;
                  return (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-4 font-mono tabular-nums text-xs text-slate-700">
                        {m.memberCode}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-slate-900">{m.name}</div>
                        <div className="text-xs text-slate-500">{m.email}</div>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-slate-600">{m.department}</td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-800">
                        {activeCount} / 3
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-xs text-slate-500">
                        {formatDateId(m.joinedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Loan Modal */}
        {loanModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-900">Catat Peminjaman Baru</h2>
                <button
                  type="button"
                  onClick={() => setLoanModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveLoan} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pilih Anggota
                  </label>
                  <select
                    required
                    value={newLoanForm.memberId}
                    onChange={(e) =>
                      setNewLoanForm({ ...newLoanForm, memberId: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.memberCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pilih Buku Tersedia
                  </label>
                  <select
                    required
                    value={newLoanForm.bookId}
                    onChange={(e) => setNewLoanForm({ ...newLoanForm, bookId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  >
                    {availableBooks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} (Sisa {b.availableCopies})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Durasi Peminjaman
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {([7, 14] as const).map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setNewLoanForm({ ...newLoanForm, durationDays: days })}
                        className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
                          newLoanForm.durationDays === days
                            ? 'border-blue-700 bg-blue-50 text-blue-800'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {days} Hari
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setLoanModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submittingActionId === 'create-loan' || availableBooks.length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    {submittingActionId === 'create-loan' ? 'Memproses...' : 'Simpan Peminjaman'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Register Member Modal */}
        {memberModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-900">Daftarkan Anggota Baru</h2>
                <button
                  type="button"
                  onClick={() => setMemberModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveMember} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    required
                    type="text"
                    value={memberForm.name}
                    onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    required
                    type="email"
                    value={memberForm.email}
                    onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Departemen / Unit
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Contoh: Teknik Sipil"
                    value={memberForm.department}
                    onChange={(e) =>
                      setMemberForm({ ...memberForm, department: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setMemberModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submittingActionId === 'create-member'}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    {submittingActionId === 'create-member' ? 'Menyimpan...' : 'Daftarkan Anggota'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // TAB 4: AUTOMATED REPORTING SYSTEM
  // =========================================================================
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sistem Pelaporan Otomatis
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Penjadwalan rekapitulasi sirkulasi otomatis, audit keterlambatan, dan ekspor CSV.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['Harian', 'Buat Laporan Harian'],
              ['Mingguan', 'Rekap Mingguan'],
              ['Audit Keterlambatan', 'Audit Keterlambatan'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              disabled={reportBusy}
              onClick={async () => {
                setReportBusy(true);
                try {
                  await onGenerateReport(kind);
                } finally {
                  setReportBusy(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scheduler Configuration */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-5 h-5 text-blue-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Konfigurasi Jadwal Pelaporan Otomatis
              </h2>
              <p className="text-xs text-slate-500">
                Jadwal berikutnya:{' '}
                <span className="font-mono tabular-nums text-slate-700">
                  {formatDateTimeId(reportSchedule.nextRunAt)}
                </span>{' '}
                · Terakhir dijalankan:{' '}
                <span className="font-mono tabular-nums text-slate-700">
                  {formatDateTimeId(reportSchedule.lastRunAt)}
                </span>
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleDraft.enabled}
              onChange={(e) =>
                setScheduleDraft({ ...scheduleDraft, enabled: e.target.checked })
              }
              className="w-4 h-4 accent-blue-700 rounded"
            />
            <span>Aktifkan Penjadwalan Otomatis</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Frekuensi Otomatis
            </label>
            <select
              value={scheduleDraft.frequency}
              onChange={(e) =>
                setScheduleDraft({
                  ...scheduleDraft,
                  frequency: e.target.value as ReportFrequency,
                })
              }
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            >
              <option value="daily">Harian (Setiap Hari)</option>
              <option value="weekly">Mingguan (Setiap 7 Hari)</option>
              <option value="monthly">Bulanan (Akhir Periode)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Jam Eksekusi Sistem
            </label>
            <select
              value={scheduleDraft.runHour}
              onChange={(e) =>
                setScheduleDraft({
                  ...scheduleDraft,
                  runHour: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            >
              {[8, 12, 17, 20, 23].map((h) => (
                <option key={h} value={h}>
                  Pukul {String(h).padStart(2, '0')}:00 WIB
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="button"
              disabled={reportBusy}
              onClick={async () => {
                setReportBusy(true);
                try {
                  await onUpdateSchedule(scheduleDraft);
                } finally {
                  setReportBusy(false);
                }
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Simpan Pengaturan Jadwal</span>
            </button>
          </div>
        </div>
      </div>

      {/* Report Archive + Detailed Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Arsip Laporan</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {reports.length} dokumen
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
            {reports.map((rep) => {
              const isSelected = selectedReport?.id === rep.id;
              return (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => setSelectedReportId(rep.id)}
                  className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                    isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono tabular-nums text-blue-700 font-medium">
                      {rep.reportCode}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {rep.trigger === 'auto' ? 'Otomatis' : 'Manual'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-1 flex items-center justify-between">
                    <span className="truncate">{rep.title}</span>
                    <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                    {formatDateTimeId(rep.generatedAt)} · {rep.generatedBy}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6">
          {selectedReport ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <div className="text-xs font-mono tabular-nums text-blue-700 font-medium">
                    {selectedReport.reportCode} · {selectedReport.kind}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mt-1">
                    {selectedReport.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Dibuat {formatDateTimeId(selectedReport.generatedAt)} oleh{' '}
                    {selectedReport.generatedBy}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={downloadingId === selectedReport.id}
                  onClick={() => handleDownloadCsv(selectedReport)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {downloadingId === selectedReport.id ? 'Mengunduh...' : 'Unduh CSV'}
                  </span>
                </button>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-xs text-slate-500">Utilisasi Koleksi</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {selectedReport.metrics.utilizationRate}%
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-xs text-slate-500">Sirkulasi Periode</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                    +{selectedReport.metrics.borrowedInPeriod} / -{selectedReport.metrics.returnedInPeriod}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-xs text-slate-500">Tepat Waktu</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
                    {selectedReport.metrics.onTimeRate}%
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-xs text-slate-500">Pinjaman Aktif</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {selectedReport.metrics.activeLoans}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-xs text-slate-500">Terlambat</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-red-600 mt-1">
                    {selectedReport.metrics.overdueLoans}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-xs text-slate-500">Akumulasi Denda</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {formatRupiah(selectedReport.metrics.totalAccruedFines)}
                  </div>
                </div>
              </div>

              {/* Overdue Snapshot */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3">
                  Daftar Keterlambatan pada Snapshot Laporan
                </h4>
                {selectedReport.overdueSnapshot.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <th className="py-2 px-3">Kode</th>
                          <th className="py-2 px-3">Buku</th>
                          <th className="py-2 px-3">Anggota</th>
                          <th className="py-2 px-3 text-right">Terlambat</th>
                          <th className="py-2 px-3 text-right">Denda</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedReport.overdueSnapshot.map((ov) => (
                          <tr key={ov.loanCode}>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-700">
                              {ov.loanCode}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900">
                              {ov.bookTitle}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{ov.memberName}</td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-red-600">
                              {ov.daysLate} hari
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                              {formatRupiah(ov.estimatedFine)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-700 py-3">
                    Tidak ada keterlambatan pengembalian pada periode laporan ini.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-10 text-center">
              Pilih laporan di samping untuk melihat rincian statistik.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
