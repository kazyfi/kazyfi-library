import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Radio,
  Search,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Book, BookCategory, Loan, Member } from '../types/library';
import { formatDateId, formatRupiah, getDueCountdownText } from '../utils/format';
import { BookCover } from './BookCover';

export type MemberTab = 'catalog' | 'my-loans' | 'history';

interface MemberDashboardProps {
  activeTab: MemberTab;
  currentMember: Member;
  books: Book[];
  loans: Loan[];
  sseConnected: boolean;
  onBorrowBook: (payload: { bookId: string; memberId: string; durationDays: 7 | 14 }) => Promise<void>;
  onReturnLoan: (loanId: string) => Promise<void>;
  onExtendLoan: (loanId: string) => Promise<void>;
  onNavigateTab: (tab: MemberTab) => void;
}

const CATEGORIES: Array<'Semua' | BookCategory> = [
  'Semua',
  'Filsafat & Sejarah',
  'Arsitektur & Desain',
  'Teknologi & Data',
  'Sastra & Fiksi',
  'Ekonomi & Bisnis',
  'Sains & Astronomi',
];

export function MemberDashboard({
  activeTab,
  currentMember,
  books,
  loans,
  sseConnected,
  onBorrowBook,
  onReturnLoan,
  onExtendLoan,
  onNavigateTab,
}: MemberDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'Semua' | BookCategory>('Semua');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [durationDays, setDurationDays] = useState<7 | 14>(7);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const memberLoans = useMemo(
    () => loans.filter((l) => l.memberId === currentMember.id),
    [loans, currentMember.id]
  );

  const activeLoans = useMemo(
    () => memberLoans.filter((l) => l.status !== 'returned'),
    [memberLoans]
  );

  const returnedLoans = useMemo(
    () => memberLoans.filter((l) => l.status === 'returned'),
    [memberLoans]
  );

  const overdueLoans = useMemo(
    () => activeLoans.filter((l) => l.status === 'overdue'),
    [activeLoans]
  );

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return books.filter((b) => {
      const matchesCat = selectedCategory === 'Semua' || b.category === selectedCategory;
      const matchesQ =
        !q ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.isbn.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [books, searchQuery, selectedCategory]);

  const personalStats = useMemo(() => {
    const totalRead = returnedLoans.length;
    const onTimeCount = returnedLoans.filter((l) => l.fineAmount === 0).length;
    const onTimePct = totalRead > 0 ? Math.round((onTimeCount / totalRead) * 100) : 100;
    const currentFineTotal = activeLoans.reduce((s, l) => s + l.fineAmount, 0);

    // Favorite category
    const catCount = new Map<string, number>();
    for (const loan of memberLoans) {
      const bk = books.find((b) => b.id === loan.bookId);
      if (bk) {
        catCount.set(bk.category, (catCount.get(bk.category) ?? 0) + 1);
      }
    }
    let topCategory = 'Belum ada';
    let topMax = 0;
    for (const [cat, cnt] of catCount.entries()) {
      if (cnt > topMax) {
        topMax = cnt;
        topCategory = cat;
      }
    }

    return {
      totalLoans: memberLoans.length,
      totalRead,
      onTimePct,
      currentFineTotal,
      topCategory,
    };
  }, [memberLoans, returnedLoans, activeLoans, books]);

  async function handleConfirmBorrow() {
    if (!selectedBook) return;
    setBusyAction(selectedBook.id);
    try {
      await onBorrowBook({
        bookId: selectedBook.id,
        memberId: currentMember.id,
        durationDays,
      });
      setSelectedBook(null);
      onNavigateTab('my-loans');
    } finally {
      setBusyAction(null);
    }
  }

  // =========================================================================
  // TAB 1: MEMBER CATALOG & SELF-BORROWING
  // =========================================================================
  if (activeTab === 'catalog') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Katalog Pustaka Digital
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Halo {currentMember.name} · Kuota pinjaman aktif saat ini{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-800">
                {activeLoans.length}/3
              </span>{' '}
              buku.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <Radio
              className={`w-3.5 h-3.5 ${sseConnected ? 'text-emerald-600' : 'text-amber-600'}`}
            />
            <span>Ketersediaan Stok Real-Time</span>
          </div>
        </div>

        {/* Search + Category Tabs */}
        <div className="space-y-3">
          <div className="relative max-w-lg">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul buku, penulis, atau nomor ISBN..."
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Book Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredBooks.map((book) => {
            const alreadyBorrowed = activeLoans.some((l) => l.bookId === book.id);
            const quotaReached = activeLoans.length >= 3;
            const outOfStock = book.availableCopies <= 0;

            return (
              <div
                key={book.id}
                className="bg-white border border-slate-200 rounded-lg p-4 flex gap-4 hover:border-slate-300 transition-colors"
              >
                <BookCover
                  src={book.coverUrl}
                  title={book.title}
                  className="w-24 h-32 rounded-sm shrink-0 border border-slate-200"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="text-xs text-slate-500 truncate">
                      {book.category} · {book.shelfCode}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug mt-1 line-clamp-2">
                      {book.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 truncate">{book.author}</p>
                    <p className="text-xs font-mono tabular-nums mt-2">
                      <span
                        className={
                          outOfStock
                            ? 'text-red-600 font-medium'
                            : 'text-emerald-700 font-medium'
                        }
                      >
                        {outOfStock
                          ? 'Stok habis'
                          : `${book.availableCopies} dari ${book.totalCopies} tersedia`}
                      </span>
                    </p>
                  </div>

                  <div className="pt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      {book.year}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedBook(book)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        alreadyBorrowed
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          : outOfStock || quotaReached
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-blue-700 text-white hover:bg-blue-800'
                      }`}
                    >
                      {alreadyBorrowed ? 'Sedang Dipinjam' : 'Detail & Pinjam'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredBooks.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg py-12 text-center text-sm text-slate-500">
            Tidak ada buku yang cocok dengan kata kunci atau kategori yang dipilih.
          </div>
        )}

        {/* Book Detail & Borrow Modal */}
        {selectedBook && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <span className="text-xs font-mono text-slate-500">
                  {selectedBook.isbn} · {selectedBook.shelfCode}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedBook(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div className="flex gap-5">
                  <BookCover
                    src={selectedBook.coverUrl}
                    title={selectedBook.title}
                    className="w-28 h-40 rounded-sm shrink-0 border border-slate-200"
                  />
                  <div>
                    <div className="text-xs text-slate-500">{selectedBook.category}</div>
                    <h2 className="text-xl font-bold text-slate-900 mt-1 leading-snug">
                      {selectedBook.title}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">{selectedBook.author}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {selectedBook.publisher}, {selectedBook.year}
                    </p>
                    <p className="text-xs font-mono tabular-nums mt-3 font-semibold text-emerald-700">
                      Tersedia {selectedBook.availableCopies} dari {selectedBook.totalCopies} eksemplar
                    </p>
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  {selectedBook.synopsis}
                </p>

                {!activeLoans.some((l) => l.bookId === selectedBook.id) &&
                  selectedBook.availableCopies > 0 &&
                  activeLoans.length < 3 && (
                    <div className="pt-2 border-t border-slate-100">
                      <label className="block text-xs font-medium text-slate-700 mb-2">
                        Pilih Durasi Peminjaman
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {([7, 14] as const).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDurationDays(d)}
                            className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
                              durationDays === d
                                ? 'border-blue-700 bg-blue-50 text-blue-800'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {d} Hari
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedBook(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Tutup
                  </button>
                  {activeLoans.some((l) => l.bookId === selectedBook.id) ? (
                    <span className="text-xs font-medium text-blue-700">
                      Anda sedang meminjam buku ini
                    </span>
                  ) : selectedBook.availableCopies <= 0 ? (
                    <span className="text-xs font-medium text-red-600">
                      Semua eksemplar sedang dipinjam
                    </span>
                  ) : activeLoans.length >= 3 ? (
                    <span className="text-xs font-medium text-amber-700">
                      Kuota maksimal 3 buku aktif tercapai
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyAction === selectedBook.id}
                      onClick={handleConfirmBorrow}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      {busyAction === selectedBook.id
                        ? 'Memproses...'
                        : 'Konfirmasi Pinjam Buku'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // TAB 2: MY ACTIVE LOANS
  // =========================================================================
  if (activeTab === 'my-loans') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Pinjaman Aktif Saya
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Pantau tenggat waktu pengembalian, perpanjang masa pinjam, atau kembalikan buku.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('catalog')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>Jelajahi Katalog</span>
          </button>
        </div>

        {overdueLoans.length > 0 && (
          <div className="bg-red-50/70 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-900">
                {overdueLoans.length} pinjaman melewati batas jatuh tempo
              </h3>
              <p className="text-xs text-red-700 mt-1">
                Segera lakukan pengembalian untuk menghentikan akumulasi denda keterlambatan (Rp 2.000/hari).
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeLoans.map((loan) => {
            const book = books.find((b) => b.id === loan.bookId);
            const isOverdue = loan.status === 'overdue';
            return (
              <div
                key={loan.id}
                className="bg-white border border-slate-200 rounded-lg p-5 flex gap-4 justify-between"
              >
                <BookCover
                  src={book?.coverUrl ?? ''}
                  title={loan.bookTitle}
                  className="w-20 h-28 rounded-sm shrink-0 border border-slate-200"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-slate-500">{loan.loanCode}</span>
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          isOverdue ? 'text-red-600' : 'text-blue-700'
                        }`}
                      >
                        {isOverdue ? (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {getDueCountdownText(loan.dueAt, loan.status)}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1 truncate">
                      {loan.bookTitle}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{loan.bookAuthor}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-mono tabular-nums text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Pinjam: {formatDateId(loan.borrowedAt)}
                      </span>
                      <span>Tempo: {formatDateId(loan.dueAt)}</span>
                    </div>
                    {loan.fineAmount > 0 && (
                      <p className="text-xs font-mono tabular-nums font-semibold text-red-600 mt-1.5">
                        Denda berjalan: {formatRupiah(loan.fineAmount)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-100">
                    {!isOverdue && loan.extendedCount === 0 && (
                      <button
                        type="button"
                        disabled={busyAction === loan.id}
                        onClick={async () => {
                          setBusyAction(loan.id);
                          try {
                            await onExtendLoan(loan.id);
                          } finally {
                            setBusyAction(null);
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                      >
                        Perpanjang (+7 Hari)
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyAction === loan.id}
                      onClick={async () => {
                        setBusyAction(loan.id);
                        try {
                          await onReturnLoan(loan.id);
                        } finally {
                          setBusyAction(null);
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md cursor-pointer"
                    >
                      Kembalikan Buku
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {activeLoans.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg py-12 text-center space-y-3">
            <p className="text-sm text-slate-600">
              Anda tidak memiliki pinjaman buku aktif saat ini.
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab('catalog')}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Pinjam Buku Pertama
            </button>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // TAB 3: MEMBER READING STATS & HISTORY
  // =========================================================================
  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Statistik & Riwayat Peminjaman
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Ringkasan aktivitas membaca pribadi untuk {currentMember.name} ({currentMember.memberCode}).
        </p>
      </div>

      {/* Personal Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Total Peminjaman</p>
          <p className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {personalStats.totalLoans}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {personalStats.totalRead} selesai · {activeLoans.length} aktif
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Ketepatan Pengembalian</p>
          <p className="text-3xl font-bold font-mono tabular-nums text-emerald-700 mt-2">
            {personalStats.onTimePct}%
          </p>
          <p className="text-xs text-slate-500 mt-2">Berdasarkan riwayat selesai</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Kategori Favorit</p>
          <p className="text-lg font-bold text-slate-900 mt-2 truncate">
            {personalStats.topCategory}
          </p>
          <p className="text-xs text-slate-500 mt-2">{currentMember.department}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Denda Aktif</p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-2 ${
              personalStats.currentFineTotal > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {formatRupiah(personalStats.currentFineTotal)}
          </p>
          <p className="text-xs text-slate-500 mt-2">Tarif keterlambatan Rp 2.000/hari</p>
        </div>
      </div>

      {/* Full History Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Semua Riwayat Transaksi</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Kode</th>
                <th className="py-3 px-4">Judul Buku</th>
                <th className="py-3 px-4">Tgl Pinjam</th>
                <th className="py-3 px-4">Jatuh Tempo</th>
                <th className="py-3 px-4">Tgl Kembali</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Denda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {memberLoans.map((loan) => (
                <tr key={loan.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                    {loan.loanCode}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{loan.bookTitle}</div>
                    <div className="text-xs text-slate-500">{loan.bookAuthor}</div>
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                    {formatDateId(loan.borrowedAt)}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                    {formatDateId(loan.dueAt)}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                    {formatDateId(loan.returnedAt)}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium">
                    {loan.status === 'returned' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Dikembalikan
                      </span>
                    ) : loan.status === 'overdue' ? (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Terlambat
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-blue-700">
                        <Clock className="w-3.5 h-3.5" />
                        Dipinjam
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                    {formatRupiah(loan.fineAmount)}
                  </td>
                </tr>
              ))}
              {memberLoans.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Belum ada riwayat peminjaman.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
