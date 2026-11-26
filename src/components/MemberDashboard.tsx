import {
  AlertTriangle,
  Bell,
  Bookmark,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Headphones,
  MessageSquare,
  QrCode,
  Radio,
  Receipt,
  Search,
  Square,
  Star,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Book,
  BookCategory,
  BookReview,
  Loan,
  Member,
  Reservation,
} from '../types/library';
import { formatDateId, formatRupiah, getDueCountdownText } from '../utils/format';
import { BookCover } from './BookCover';
import { FinePaymentModal, type SubmitFineProofPayload } from './FinePaymentModal';

export type MemberTab = 'catalog' | 'my-loans' | 'history';

interface MemberDashboardProps {
  activeTab: MemberTab;
  currentMember: Member;
  books: Book[];
  loans: Loan[];
  reservations: Reservation[];
  reviews: BookReview[];
  sseConnected: boolean;
  onBorrowBook: (payload: { bookId: string; memberId: string; durationDays: 7 | 14 }) => Promise<void>;
  onReturnLoan: (loanId: string) => Promise<void>;
  onExtendLoan: (loanId: string) => Promise<void>;
  onReserveBook: (payload: { bookId: string; memberId: string }) => Promise<void>;
  onCancelReservation: (reservationId: string) => Promise<void>;
  onToggleBookmark: (memberId: string, bookId: string) => Promise<void>;
  onSubmitReview: (bookId: string, payload: { rating: number; comment: string }) => Promise<void>;
  onSubmitFineProof: (loanId: string, payload: SubmitFineProofPayload) => Promise<void>;
  onNavigateTab: (tab: MemberTab) => void;
}

const CATEGORIES: Array<'Semua' | 'Tersimpan' | BookCategory> = [
  'Semua',
  'Tersimpan',
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
  reservations,
  reviews,
  sseConnected,
  onBorrowBook,
  onReturnLoan,
  onExtendLoan,
  onReserveBook,
  onCancelReservation,
  onToggleBookmark,
  onSubmitReview,
  onSubmitFineProof,
  onNavigateTab,
}: MemberDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<'Semua' | 'Tersimpan' | BookCategory>('Semua');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'info' | 'excerpt' | 'reviews'>('info');
  const [durationDays, setDurationDays] = useState<7 | 14>(7);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [fineModalLoanId, setFineModalLoanId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? null,
    [books, selectedBookId]
  );

  const liveFineModalLoan = useMemo(
    () => loans.find((l) => l.id === fineModalLoanId) ?? null,
    [loans, fineModalLoanId]
  );

  // Keyboard shortcut '/' to jump to search input in Catalog
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        activeTab === 'catalog' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  // Stop Web Speech synthesis on modal close or unmount
  useEffect(() => {
    if (!selectedBookId && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [selectedBookId]);

  const bookmarkSet = useMemo(
    () => new Set(currentMember.bookmarkIds ?? []),
    [currentMember.bookmarkIds]
  );

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

  const unpaidFineLoans = useMemo(
    () => memberLoans.filter((l) => l.fineAmount > 0 && !l.finePaid),
    [memberLoans]
  );

  const memberReservations = useMemo(
    () =>
      reservations.filter(
        (r) =>
          r.memberId === currentMember.id &&
          (r.status === 'waiting' || r.status === 'ready')
      ),
    [reservations, currentMember.id]
  );

  const readyReservations = useMemo(
    () => memberReservations.filter((r) => r.status === 'ready'),
    [memberReservations]
  );

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return books.filter((b) => {
      const matchesCat =
        selectedCategory === 'Semua'
          ? true
          : selectedCategory === 'Tersimpan'
          ? bookmarkSet.has(b.id)
          : b.category === selectedCategory;
      const matchesQ =
        !q ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.isbn.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [books, searchQuery, selectedCategory, bookmarkSet]);

  const selectedBookReviews = useMemo(
    () =>
      selectedBook
        ? reviews.filter((r) => r.bookId === selectedBook.id)
        : [],
    [reviews, selectedBook]
  );

  const personalStats = useMemo(() => {
    const totalRead = returnedLoans.length;
    const onTimeCount = returnedLoans.filter((l) => l.fineAmount === 0).length;
    const onTimePct = totalRead > 0 ? Math.round((onTimeCount / totalRead) * 100) : 100;
    const currentFineTotal = unpaidFineLoans.reduce((s, l) => s + l.fineAmount, 0);

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
  }, [memberLoans, returnedLoans, unpaidFineLoans, books]);

  function toggleAudioReader(book: Book) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const content =
      modalTab === 'excerpt' && book.sampleExcerpt
        ? `${book.title}, oleh ${book.author}. ${book.sampleExcerpt}`
        : `${book.title}, oleh ${book.author}. Sinopsis: ${book.synopsis}`;
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = 'id-ID';
    utterance.rate = 0.96;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  async function handleConfirmBorrow() {
    if (!selectedBook) return;
    setBusyAction(selectedBook.id);
    try {
      await onBorrowBook({
        bookId: selectedBook.id,
        memberId: currentMember.id,
        durationDays,
      });
      setSelectedBookId(null);
      onNavigateTab('my-loans');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmReserve() {
    if (!selectedBook) return;
    setBusyAction(selectedBook.id);
    try {
      await onReserveBook({
        bookId: selectedBook.id,
        memberId: currentMember.id,
      });
      setSelectedBookId(null);
      onNavigateTab('my-loans');
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePostReview(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBook || !reviewComment.trim()) return;
    setReviewBusy(true);
    try {
      await onSubmitReview(selectedBook.id, {
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setReviewComment('');
      setReviewRating(5);
    } finally {
      setReviewBusy(false);
    }
  }

  const finePaymentModalNode = (
    <FinePaymentModal
      loan={liveFineModalLoan}
      memberName={currentMember.name}
      onClose={() => setFineModalLoanId(null)}
      onSubmit={onSubmitFineProof}
    />
  );

  // =========================================================================
  // TAB 1: MEMBER CATALOG, DIGITAL CARD & SELF-BORROWING
  // =========================================================================
  if (activeTab === 'catalog') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
              Katalog Kazyfi Library
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Selamat membaca, {currentMember.name} · Kuota pinjaman aktif{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                {activeLoans.length}/3
              </span>{' '}
              buku.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <Radio
              className={`w-3.5 h-3.5 ${
                sseConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            />
            <span className="font-medium">Ketersediaan Stok Real-Time</span>
          </div>
        </div>

        {/* Integrated Digital Member Card & Personal Notification Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-5 bg-gradient-to-br from-[#14224A] via-[#1B2F66] to-[#0E1836] text-white border border-[#2B4388]/60 rounded-xl p-5 flex items-center justify-between gap-4 shadow-xs">
            <div className="min-w-0">
              <div className="text-[11px] font-mono tracking-wider text-amber-300/95 font-medium">
                KARTU ANGGOTA KAZYFI LIBRARY · {currentMember.memberCode}
              </div>
              <div className="text-lg font-bold text-white mt-1.5 truncate">
                {currentMember.name}
              </div>
              <div className="text-xs text-indigo-100/80 mt-0.5 truncate">
                {currentMember.department} ·{' '}
                {currentMember.status === 'active' ? 'Keanggotaan Aktif' : 'Ditangguhkan'}
              </div>
              <div className="mt-3.5 flex items-center gap-3 text-xs font-mono tabular-nums text-indigo-100/90">
                <span>{bookmarkSet.size} tersimpan</span>
                <span aria-hidden="true" className="text-indigo-300/50">·</span>
                <span>{returnedLoans.length} selesai dibaca</span>
              </div>
            </div>
            <div className="w-16 h-16 rounded-lg bg-white p-2 flex items-center justify-center shrink-0 shadow-xs">
              <QrCode className="w-10 h-10 text-[#14224A]" />
            </div>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Bell className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400" />
                <span>Status Sirkulasi & Pengingat Pribadi</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('my-loans')}
                className="text-xs font-semibold text-[#1A2B5E] dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap"
              >
                Kelola Pinjaman
              </button>
            </div>

            <div className="mt-3 space-y-1.5 text-xs leading-relaxed">
              {readyReservations.length > 0 && (
                <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                  Antrean tersedia: &ldquo;{readyReservations[0].bookTitle}&rdquo; siap dipinjam sekarang.
                </p>
              )}
              {overdueLoans.length > 0 ? (
                <p className="text-red-600 dark:text-red-400 font-medium">
                  Perhatian: {overdueLoans.length} pinjaman melewati jatuh tempo (estimasi denda{' '}
                  {formatRupiah(personalStats.currentFineTotal)}).
                </p>
              ) : unpaidFineLoans.length > 0 ? (
                <p className="text-amber-700 dark:text-amber-400 font-medium">
                  Terdapat {unpaidFineLoans.length} tagihan denda keterlambatan belum lunas sebesar{' '}
                  {formatRupiah(personalStats.currentFineTotal)}.
                </p>
              ) : activeLoans.length > 0 ? (
                <p className="text-slate-600 dark:text-slate-300">
                  Pinjaman terdekat jatuh tempo: &ldquo;{activeLoans[0].bookTitle}&rdquo; (
                  {getDueCountdownText(activeLoans[0].dueAt, activeLoans[0].status)}).
                </p>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">
                  Tidak ada pinjaman jatuh tempo. Anda memiliki kuota penuh untuk meminjam hingga 3 buku.
                </p>
              )}
              {unpaidFineLoans.length > 0 && (
                <div className="pt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      unpaidFineLoans.length === 1
                        ? setFineModalLoanId(unpaidFineLoans[0].id)
                        : onNavigateTab('my-loans')
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Bayar Denda (Rekening / QRIS)</span>
                  </button>
                  {unpaidFineLoans.some((l) => l.finePaymentStatus === 'pending_verification') && (
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      · Ada bukti pembayaran menunggu verifikasi admin
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search + Category Tabs */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-64 max-w-lg">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul buku, penulis, atau ISBN (tekan / untuk fokus)..."
                aria-label="Cari judul buku, penulis, atau nomor ISBN"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
              />
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Menampilkan {filteredBooks.length} dari {books.length} judul
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#1A2B5E] dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {cat === 'Tersimpan' ? `Tersimpan (${bookmarkSet.size})` : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Book Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredBooks.map((book) => {
            const alreadyBorrowed = activeLoans.some((l) => l.bookId === book.id);
            const alreadyReserved = memberReservations.some((r) => r.bookId === book.id);
            const isBookmarked = bookmarkSet.has(book.id);
            const outOfStock = book.availableCopies <= 0;

            return (
              <div
                key={book.id}
                className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 flex gap-4 hover:border-indigo-300/80 dark:hover:border-indigo-700/70 transition-colors"
              >
                <BookCover
                  src={book.coverUrl}
                  title={book.title}
                  className="w-24 h-32 rounded-md shrink-0 border border-slate-200/80 dark:border-slate-700/80 shadow-xs"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {book.category} · {book.shelfCode}
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleBookmark(currentMember.id, book.id)}
                        aria-label={
                          isBookmarked
                            ? `Hapus ${book.title} dari daftar bacaan`
                            : `Simpan ${book.title} ke daftar bacaan`
                        }
                        className="p-1 -mt-1 -mr-1 text-slate-400 hover:text-[#1A2B5E] dark:hover:text-indigo-400 cursor-pointer shrink-0"
                      >
                        <Bookmark
                          className={`w-4 h-4 ${
                            isBookmarked ? 'fill-[#1A2B5E] text-[#1A2B5E] dark:fill-indigo-400 dark:text-indigo-400' : ''
                          }`}
                        />
                      </button>
                    </div>
                    <h3 className="text-[15px] font-bold text-slate-950 dark:text-slate-50 leading-snug mt-1 line-clamp-2 min-h-[2.5rem]">
                      {book.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 truncate">
                      {book.author}
                    </p>
                    <div className="flex items-center gap-2 text-xs font-mono tabular-nums mt-2">
                      <span
                        className={
                          outOfStock
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : 'text-emerald-700 dark:text-emerald-400 font-medium'
                        }
                      >
                        {outOfStock
                          ? 'Stok habis'
                          : `${book.availableCopies}/${book.totalCopies} tersedia`}
                      </span>
                      {(book.ratingCount ?? 0) > 0 && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                            {book.ratingAvg}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                      {book.year}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setModalTab('info');
                        setSelectedBookId(book.id);
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        alreadyBorrowed || alreadyReserved
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                          : outOfStock
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'bg-[#1A2B5E] text-white hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500'
                      }`}
                    >
                      {alreadyBorrowed
                        ? 'Sedang Dipinjam'
                        : alreadyReserved
                        ? 'Dalam Antrean'
                        : outOfStock
                        ? 'Antre Reservasi'
                        : 'Detail & Pinjam'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredBooks.length === 0 && (
          <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Tidak ada buku yang cocok dengan kata kunci atau filter yang dipilih.
          </div>
        )}

        {/* Inclusive Book Detail, Reader Preview, Audio Read-Aloud & Reviews Modal */}
        {selectedBook && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 dark:bg-black/75 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-detail-title"
          >
            <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800">
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {selectedBook.isbn} · {selectedBook.shelfCode}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleBookmark(currentMember.id, selectedBook.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Bookmark
                      className={`w-3.5 h-3.5 ${
                        bookmarkSet.has(selectedBook.id)
                          ? 'fill-[#1A2B5E] text-[#1A2B5E] dark:fill-indigo-400 dark:text-indigo-400'
                          : ''
                      }`}
                    />
                    <span>{bookmarkSet.has(selectedBook.id) ? 'Tersimpan' : 'Simpan'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBookId(null)}
                    aria-label="Tutup detail buku"
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto">
                <div className="flex flex-col sm:flex-row gap-5">
                  <BookCover
                    src={selectedBook.coverUrl}
                    title={selectedBook.title}
                    className="w-28 h-40 rounded-md shrink-0 border border-slate-200/80 dark:border-slate-700 shadow-xs"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedBook.category}
                    </div>
                    <h2
                      id="book-detail-title"
                      className="text-xl font-bold text-slate-950 dark:text-slate-50 mt-1 leading-snug"
                    >
                      {selectedBook.title}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      {selectedBook.author}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {selectedBook.publisher}, {selectedBook.year}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs font-mono tabular-nums">
                      <span
                        className={`font-semibold ${
                          selectedBook.availableCopies > 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        Tersedia {selectedBook.availableCopies}/{selectedBook.totalCopies} eksemplar
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        {selectedBook.ratingCount
                          ? `${selectedBook.ratingAvg} (${selectedBook.ratingCount} ulasan)`
                          : 'Belum ada ulasan'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Modal Section Tabs + Inclusive Audio Read-Aloud */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200/60 dark:border-slate-800">
                    {(
                      [
                        ['info', 'Sinopsis'],
                        ['excerpt', 'Cuplikan Baca'],
                        ['reviews', `Ulasan (${selectedBookReviews.length})`],
                      ] as const
                    ).map(([tKey, tLabel]) => (
                      <button
                        key={tKey}
                        type="button"
                        onClick={() => setModalTab(tKey)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          modalTab === tKey
                            ? 'bg-white dark:bg-[#1B2436] text-indigo-950 dark:text-white shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {tLabel}
                      </button>
                    ))}
                  </div>

                  {typeof window !== 'undefined' && 'speechSynthesis' in window && modalTab !== 'reviews' && (
                    <button
                      type="button"
                      onClick={() => toggleAudioReader(selectedBook)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        isSpeaking
                          ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {isSpeaking ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>Hentikan Suara</span>
                        </>
                      ) : (
                        <>
                          <Headphones className="w-3.5 h-3.5" />
                          <span>Dengarkan Teks</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {modalTab === 'info' && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectedBook.synopsis}
                    </p>
                    {!activeLoans.some((l) => l.bookId === selectedBook.id) &&
                      selectedBook.availableCopies > 0 &&
                      activeLoans.length < 3 &&
                      currentMember.status === 'active' && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                                    ? 'border-[#1A2B5E] bg-indigo-50/80 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-500 font-semibold'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                              >
                                {d} Hari
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {modalTab === 'excerpt' && (
                  <div className="p-4 bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200/80 dark:border-slate-800 rounded-xl">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                      Pratinjau Baca Digital
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                      {selectedBook.sampleExcerpt || selectedBook.synopsis}
                    </p>
                  </div>
                )}

                {modalTab === 'reviews' && (
                  <div className="space-y-4">
                    <form
                      onSubmit={handlePostReview}
                      className="p-3.5 bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Tulis Ulasan Pembaca
                        </span>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewRating(star)}
                              aria-label={`Beri nilai ${star} bintang`}
                              className="p-0.5 cursor-pointer"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  star <= reviewRating
                                    ? 'text-amber-500 fill-amber-500'
                                    : 'text-slate-300 dark:text-slate-700'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          minLength={4}
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Bagikan kesan atau manfaat buku ini..."
                          className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                        />
                        <button
                          type="submit"
                          disabled={reviewBusy}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          {reviewBusy ? 'Mengirim...' : 'Kirim Ulasan'}
                        </button>
                      </div>
                    </form>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedBookReviews.map((rev) => (
                        <div key={rev.id} className="py-3 first:pt-0">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {rev.memberName}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono text-amber-600 dark:text-amber-400">
                              <Star className="w-3 h-3 fill-current" />
                              {rev.rating}/5 · {formatDateId(rev.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            {rev.comment}
                          </p>
                        </div>
                      ))}
                      {selectedBookReviews.length === 0 && (
                        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-1">
                          <MessageSquare className="w-4 h-4 text-slate-400" />
                          <span>Jadilah anggota pertama yang mengulas buku ini.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedBookId(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                  >
                    Tutup
                  </button>
                  {currentMember.status !== 'active' ? (
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      Status keanggotaan Anda sedang ditangguhkan
                    </span>
                  ) : activeLoans.some((l) => l.bookId === selectedBook.id) ? (
                    <span className="text-xs font-medium text-[#1A2B5E] dark:text-indigo-400">
                      Anda sedang meminjam buku ini
                    </span>
                  ) : memberReservations.some((r) => r.bookId === selectedBook.id) ? (
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Anda sudah masuk antrean reservasi
                    </span>
                  ) : selectedBook.availableCopies <= 0 ? (
                    <button
                      type="button"
                      disabled={busyAction === selectedBook.id}
                      onClick={handleConfirmReserve}
                      className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      {busyAction === selectedBook.id
                        ? 'Memproses...'
                        : 'Masuk Antrean Reservasi'}
                    </button>
                  ) : activeLoans.length >= 3 ? (
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Kuota maksimal 3 buku aktif tercapai
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyAction === selectedBook.id}
                      onClick={handleConfirmBorrow}
                      className="px-4 py-2 text-sm font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg disabled:opacity-50 cursor-pointer"
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
        {finePaymentModalNode}
      </div>
    );
  }

  // =========================================================================
  // TAB 2: MY ACTIVE LOANS & RESERVATION QUEUE
  // =========================================================================
  if (activeTab === 'my-loans') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
              Pinjaman & Reservasi Saya
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Pantau tenggat pengembalian, perpanjang masa pinjam, atau kelola antrean reservasi buku.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('catalog')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>Jelajahi Katalog</span>
          </button>
        </div>

        {overdueLoans.length > 0 && (
          <div className="bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">
                {overdueLoans.length} pinjaman melewati batas jatuh tempo
              </h3>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                Segera lakukan pengembalian untuk menghentikan akumulasi denda keterlambatan (Rp 2.000/hari).
              </p>
            </div>
          </div>
        )}

        {unpaidFineLoans.length > 0 && (
          <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-[#F6F7FA]/80 dark:bg-[#0B0F17]/60">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  Tagihan Denda Keterlambatan ({unpaidFineLoans.length})
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums font-semibold text-red-600 dark:text-red-400">
                Total: {formatRupiah(personalStats.currentFineTotal)}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {unpaidFineLoans.map((loan) => {
                const isPending = loan.finePaymentStatus === 'pending_verification';
                const isRejected = loan.finePaymentStatus === 'rejected';
                return (
                  <div
                    key={`fine-${loan.id}`}
                    className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {loan.loanCode}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {loan.bookTitle}
                        </span>
                        {isPending ? (
                          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800">
                            Menunggu Verifikasi Admin
                          </span>
                        ) : isRejected ? (
                          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200/80 dark:border-red-800">
                            Bukti Ditolak
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Belum Dibayar
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {loan.status === 'returned'
                          ? `Dikembalikan ${formatDateId(loan.returnedAt)}`
                          : 'Pinjaman masih berjalan · Tarik denda Rp 2.000/hari'}
                        {isRejected && loan.finePaymentProof?.rejectionReason && (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            {' '}· Alasan: {loan.finePaymentProof.rejectionReason}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums text-sm font-bold text-red-600 dark:text-red-400">
                        {formatRupiah(loan.fineAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFineModalLoanId(loan.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isPending
                            ? 'text-[#1A2B5E] dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
                            : 'text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500'
                        }`}
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>
                          {isPending
                            ? 'Lihat Bukti Bayar'
                            : isRejected
                            ? 'Unggah Ulang Bukti'
                            : 'Bayar (Rekening / QRIS)'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Loans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeLoans.map((loan) => {
            const book = books.find((b) => b.id === loan.bookId);
            const isOverdue = loan.status === 'overdue';
            const hasUnpaidFine = loan.fineAmount > 0 && !loan.finePaid;
            const isPendingProof = loan.finePaymentStatus === 'pending_verification';
            return (
              <div
                key={loan.id}
                className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex gap-4 justify-between"
              >
                <BookCover
                  src={book?.coverUrl ?? ''}
                  title={loan.bookTitle}
                  className="w-20 h-28 rounded-md shrink-0 border border-slate-200/80 dark:border-slate-700 shadow-xs"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        {loan.loanCode}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          isOverdue
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-[#1A2B5E] dark:text-indigo-400'
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
                    <h3 className="text-base font-bold text-slate-950 dark:text-slate-50 mt-1 truncate">
                      {loan.bookTitle}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {loan.bookAuthor}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Pinjam: {formatDateId(loan.borrowedAt)}
                      </span>
                      <span>Tempo: {formatDateId(loan.dueAt)}</span>
                    </div>
                    {hasUnpaidFine && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono tabular-nums font-semibold text-red-600 dark:text-red-400">
                          Denda berjalan: {formatRupiah(loan.fineAmount)}
                        </span>
                        {isPendingProof && (
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            (Bukti dikirim · Menunggu verifikasi)
                          </span>
                        )}
                        {loan.finePaymentStatus === 'rejected' && (
                          <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                            (Bukti ditolak)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
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
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer"
                      >
                        Perpanjang (+7 Hari)
                      </button>
                    )}
                    {hasUnpaidFine && (
                      <button
                        type="button"
                        onClick={() => setFineModalLoanId(loan.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>{isPendingProof ? 'Lihat Bukti' : 'Bayar Denda'}</span>
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
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
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
          <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl py-10 text-center space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Anda tidak memiliki pinjaman buku aktif saat ini.
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab('catalog')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg cursor-pointer"
            >
              Jelajahi Katalog Buku
            </button>
          </div>
        )}

        {/* Member Reservations Section */}
        <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50 mb-3">
            Antrean Reservasi Buku Saya
          </h2>
          {memberReservations.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {memberReservations.map((resv) => {
                const targetBook = books.find((b) => b.id === resv.bookId);
                const canBorrowNow =
                  resv.status === 'ready' && (targetBook?.availableCopies ?? 0) > 0;
                return (
                  <div
                    key={resv.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {resv.bookTitle}
                      </div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {resv.reservationCode} ·{' '}
                        {resv.status === 'ready'
                          ? 'Giliran Anda tiba — siap dipinjam'
                          : 'Menunggu pengembalian salinan'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canBorrowNow && (
                        <button
                          type="button"
                          onClick={() =>
                            onBorrowBook({
                              bookId: resv.bookId,
                              memberId: currentMember.id,
                              durationDays: 7,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg cursor-pointer"
                        >
                          Pinjam Sekarang
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onCancelReservation(resv.id)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Batalkan
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Anda tidak memiliki antrean reservasi buku saat ini.
            </p>
          )}
        </div>
        {finePaymentModalNode}
      </div>
    );
  }

  // =========================================================================
  // TAB 3: MEMBER READING STATS & HISTORY
  // =========================================================================
  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-slate-200/90 dark:border-slate-800">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
          Statistik & Riwayat Peminjaman
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Ringkasan aktivitas membaca pribadi untuk {currentMember.name} ({currentMember.memberCode}).
        </p>
      </div>

      {/* Personal Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Peminjaman
          </p>
          <p className="text-3xl font-bold font-mono tabular-nums text-slate-950 dark:text-slate-50 mt-2">
            {personalStats.totalLoans}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {personalStats.totalRead} selesai · {activeLoans.length} aktif
          </p>
        </div>

        <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Ketepatan Pengembalian
          </p>
          <p className="text-3xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-2">
            {personalStats.onTimePct}%
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Berdasarkan riwayat selesai
          </p>
        </div>

        <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Kategori Favorit
          </p>
          <p className="text-lg font-bold text-slate-950 dark:text-slate-50 mt-2 truncate">
            {personalStats.topCategory}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {currentMember.department}
          </p>
        </div>

        <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Denda Belum Lunas
            </p>
            <p
              className={`text-2xl font-bold font-mono tabular-nums mt-2 ${
                personalStats.currentFineTotal > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-950 dark:text-slate-50'
              }`}
            >
              {formatRupiah(personalStats.currentFineTotal)}
            </p>
          </div>
          {unpaidFineLoans.length > 0 ? (
            <button
              type="button"
              onClick={() => setFineModalLoanId(unpaidFineLoans[0].id)}
              className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Bayar via Rekening / QRIS</span>
            </button>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Tarif keterlambatan Rp 2.000/hari
            </p>
          )}
        </div>
      </div>

      {/* Full History Table */}
      <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            Semua Riwayat Transaksi
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F6F7FA]/90 dark:bg-[#0B0F17]/60 border-b border-slate-200/80 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Kode</th>
                <th className="py-3 px-4">Judul Buku</th>
                <th className="py-3 px-4">Tgl Pinjam</th>
                <th className="py-3 px-4">Jatuh Tempo</th>
                <th className="py-3 px-4">Tgl Kembali</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Denda</th>
                <th className="py-3 px-4 text-right">Pembayaran Denda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {memberLoans.map((loan) => {
                const isPending = loan.finePaymentStatus === 'pending_verification';
                const isRejected = loan.finePaymentStatus === 'rejected';
                return (
                  <tr
                    key={loan.id}
                    className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                      {loan.loanCode}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {loan.bookTitle}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {loan.bookAuthor}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                      {formatDateId(loan.borrowedAt)}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                      {formatDateId(loan.dueAt)}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                      {formatDateId(loan.returnedAt)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium">
                      {loan.status === 'returned' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Dikembalikan
                        </span>
                      ) : loan.status === 'overdue' ? (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Terlambat
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#1A2B5E] dark:text-indigo-400">
                          <Clock className="w-3.5 h-3.5" />
                          Dipinjam
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                      {formatRupiah(loan.fineAmount)}
                      {loan.finePaid ? ' (Lunas)' : ''}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {loan.fineAmount > 0 ? (
                        loan.finePaid ? (
                          loan.finePaymentProof ? (
                            <button
                              type="button"
                              onClick={() => setFineModalLoanId(loan.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 rounded-md cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Lihat Bukti</span>
                            </button>
                          ) : (
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              Lunas
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => setFineModalLoanId(loan.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                              isPending
                                ? 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                                : isRejected
                                ? 'text-white bg-red-600 hover:bg-red-700'
                                : 'text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500'
                            }`}
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>
                              {isPending
                                ? 'Menunggu Verifikasi'
                                : isRejected
                                ? 'Unggah Ulang'
                                : 'Bayar Denda'}
                            </span>
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {memberLoans.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    Belum ada riwayat peminjaman.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {finePaymentModalNode}
    </div>
  );
}
