import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bookmark,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Headphones,
  History,
  Library,
  Lock,
  LogIn,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  QrCode,
  Radio,
  Receipt,
  Search,
  Square,
  Star,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOOK_CATEGORIES,
  type Book,
  type BookCategory,
  type BookReview,
  type Loan,
  type Member,
  type Reservation,
} from '../types/library';
import { formatDateId, formatRupiah, getDueCountdownText } from '../utils/format';
import { BookCover } from './BookCover';
import { FinePaymentModal, type SubmitFineProofPayload } from './FinePaymentModal';
import { HoverPop } from './HoverPop';

export type MemberTab =
  | 'home'
  | 'catalog'
  | 'reading-room'
  | 'my-loans'
  | 'history'
  | 'profile';

interface MemberDashboardProps {
  activeTab: MemberTab;
  currentMember: Member | null;
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
  onOpenAuth: (mode: 'login' | 'signup' | 'activate') => void;
}

const CATEGORIES: Array<'Semua' | 'Tersimpan' | BookCategory> = [
  'Semua',
  'Tersimpan',
  ...BOOK_CATEGORIES,
];

const HERO_IMAGE_URL = '/src/assets/images/hero_kazyfi_library_hall_1795706793499.jpg';
const READING_ROOM_IMAGE_URL = '/src/assets/images/reading_room_digital_1795706794486.jpg';

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
  onOpenAuth,
}: MemberDashboardProps) {
  const [heroSearchQuery, setHeroSearchQuery] = useState('');
  const [heroCategory, setHeroCategory] = useState<'Semua' | BookCategory>('Semua');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<'Semua' | 'Tersimpan' | BookCategory>('Semua');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'info' | 'excerpt' | 'reviews'>('info');
  const [durationDays, setDurationDays] = useState<7 | 14>(7);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [rbvSearch, setRbvSearch] = useState('');
  const [rbvSelectedId, setRbvSelectedId] = useState<string>(books[0]?.id ?? '');

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [fineModalLoanId, setFineModalLoanId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? null,
    [books, selectedBookId]
  );

  const activeRbvBook = useMemo(
    () => books.find((b) => b.id === rbvSelectedId) ?? books[0] ?? null,
    [books, rbvSelectedId]
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

  // Stop Web Speech synthesis on modal/tab change or unmount
  useEffect(() => {
    if (
      !selectedBookId &&
      activeTab !== 'reading-room' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [selectedBookId, activeTab]);

  const bookmarkSet = useMemo(
    () => new Set(currentMember?.bookmarkIds ?? []),
    [currentMember]
  );

  const memberLoans = useMemo(
    () => (currentMember ? loans.filter((l) => l.memberId === currentMember.id) : []),
    [loans, currentMember]
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
      currentMember
        ? reservations.filter(
            (r) =>
              r.memberId === currentMember.id &&
              (r.status === 'waiting' || r.status === 'ready')
          )
        : [],
    [reservations, currentMember]
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
        b.isbn.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [books, searchQuery, selectedCategory, bookmarkSet]);

  const filteredRbvBooks = useMemo(() => {
    const q = rbvSearch.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q)
    );
  }, [books, rbvSearch]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<BookCategory, number>();
    for (const cat of BOOK_CATEGORIES) counts.set(cat, 0);
    for (const b of books) {
      counts.set(b.category, (counts.get(b.category) ?? 0) + 1);
    }
    return counts;
  }, [books]);

  const featuredBooks = useMemo(
    () => [...books].sort((a, b) => b.borrowCount - a.borrowCount).slice(0, 4),
    [books]
  );

  const totalCopiesCount = useMemo(
    () => books.reduce((sum, b) => sum + b.totalCopies, 0),
    [books]
  );

  const availableCopiesCount = useMemo(
    () => books.reduce((sum, b) => sum + b.availableCopies, 0),
    [books]
  );

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

  function toggleAudioReader(book: Book, forceExcerpt = false) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const content =
      (forceExcerpt || modalTab === 'excerpt') && book.sampleExcerpt
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

  function handleHeroOneSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(heroSearchQuery.trim());
    setSelectedCategory(heroCategory);
    onNavigateTab('catalog');
  }

  function openCategoryInCatalog(cat: BookCategory) {
    setSearchQuery('');
    setSelectedCategory(cat);
    onNavigateTab('catalog');
  }

  async function handleConfirmBorrow() {
    if (!selectedBook) return;
    if (!currentMember) {
      setSelectedBookId(null);
      onOpenAuth('login');
      return;
    }
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
    if (!currentMember) {
      setSelectedBookId(null);
      onOpenAuth('login');
      return;
    }
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
    if (!selectedBook || !currentMember || !reviewComment.trim()) return;
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
      memberName={currentMember?.name ?? 'Anggota'}
      onClose={() => setFineModalLoanId(null)}
      onSubmit={onSubmitFineProof}
    />
  );

  function renderBookHoverCard(book: Book, hint = 'Klik kartu atau tombol Detail & Pinjam untuk meminjam') {
    const outOfStock = book.availableCopies <= 0;
    return (
      <div className="space-y-2.5">
        <div className="flex gap-3">
          <BookCover
            src={book.coverUrl}
            title={book.title}
            className="w-12 h-18 rounded-xs shrink-0 border border-slate-200 dark:border-slate-700"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
              {book.category} · {book.shelfCode}
            </div>
            <div className="text-xs font-bold text-slate-950 dark:text-slate-50 leading-snug line-clamp-2 mt-0.5">
              {book.title}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
              {book.author} · {book.year}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
          {book.synopsis}
        </p>
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
          <span
            className={
              outOfStock
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : 'text-emerald-700 dark:text-emerald-400 font-semibold'
            }
          >
            {outOfStock
              ? 'Stok habis (Bisa reservasi)'
              : `${book.availableCopies}/${book.totalCopies} tersedia`}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            ISBN {book.isbn}
          </span>
        </div>
        <div className="text-[10px] font-medium text-[#1A2B5E] dark:text-indigo-300">
          {hint}
        </div>
      </div>
    );
  }

  const bookDetailModalNode = selectedBook ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 dark:bg-black/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-detail-title"
      onClick={() => setSelectedBookId(null)}
    >
      <div
        className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800">
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {selectedBook.isbn} · {selectedBook.shelfCode}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!currentMember) {
                  setSelectedBookId(null);
                  onOpenAuth('login');
                  return;
                }
                onToggleBookmark(currentMember.id, selectedBook.id);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
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

          {/* Sub-tabs inside Book Detail */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200/60 dark:border-slate-800">
              {(
                [
                  ['info', 'Ringkasan & Pinjam'],
                  ['excerpt', 'Pratinjau Baca'],
                  ['reviews', `Ulasan (${selectedBookReviews.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setModalTab(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    modalTab === key
                      ? 'bg-white dark:bg-[#1B2436] text-indigo-950 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {typeof window !== 'undefined' && 'speechSynthesis' in window && (
              <button
                type="button"
                onClick={() => toggleAudioReader(selectedBook)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
              {currentMember &&
                !activeLoans.some((l) => l.bookId === selectedBook.id) &&
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
              {currentMember ? (
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
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {reviewBusy ? 'Mengirim...' : 'Kirim Ulasan'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-3.5 bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200/80 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    Masuk sebagai anggota untuk menulis ulasan dan memberi nilai bintang.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBookId(null);
                      onOpenAuth('login');
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Masuk Anggota
                  </button>
                </div>
              )}

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

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSelectedBookId(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              Tutup
            </button>
            {!currentMember ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBookId(null);
                    onOpenAuth('signup');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-[#1A2B5E] dark:text-indigo-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  Daftar Anggota
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBookId(null);
                    onOpenAuth('login');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Masuk untuk Meminjam</span>
                </button>
              </>
            ) : currentMember.status !== 'active' ? (
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
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
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
                className="px-4 py-2 text-sm font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
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
  ) : null;

  // =========================================================================
  // TAB 0: PORTAL BERANDA (Academic Digital Library Portal — pustaka.ut.ac.id/lib style)
  // =========================================================================
  if (activeTab === 'home') {
    const platformShortcuts = [
      {
        index: '01.',
        title: 'Katalog OPAC',
        desc: 'Telusuri ketersediaan koleksi fisik dan digital lintas 14 bidang ilmu secara real-time.',
        actionLabel: 'Buka Katalog OPAC',
        onClick: () => onNavigateTab('catalog'),
      },
      {
        index: '02.',
        title: 'Ruang Baca Virtual (RBV)',
        desc: 'Baca cuplikan bab pembuka buku referensi lengkap dengan pembaca audio bahasa Indonesia.',
        actionLabel: 'Masuk Ruang Baca',
        onClick: () => onNavigateTab('reading-room'),
      },
      {
        index: '03.',
        title: 'Pinjaman & Antrean',
        desc: currentMember
          ? `Pantau ${activeLoans.length} pinjaman aktif, perpanjang masa pinjam, dan kelola antrean reservasi.`
          : 'Khusus anggota yang sudah masuk. Login untuk memantau pinjaman aktif, perpanjangan, dan reservasi.',
        actionLabel: currentMember ? 'Lihat Pinjaman' : 'Masuk untuk Akses',
        onClick: () => onNavigateTab('my-loans'),
      },
      {
        index: '04.',
        title: 'Pembayaran Denda & QRIS',
        desc:
          currentMember && unpaidFineLoans.length > 0
            ? `Ada ${unpaidFineLoans.length} tagihan (${formatRupiah(personalStats.currentFineTotal)}) siap dibayar via Bank atau QRIS.`
            : 'Bayar denda keterlambatan via transfer rekening bank atau QRIS dinamis dan unggah bukti.',
        actionLabel:
          currentMember && unpaidFineLoans.length > 0
            ? 'Bayar Tagihan Denda'
            : 'Cek Status Denda',
        onClick: () =>
          currentMember && unpaidFineLoans.length === 1
            ? setFineModalLoanId(unpaidFineLoans[0].id)
            : onNavigateTab('my-loans'),
      },
      {
        index: '05.',
        title: 'Statistik & Riwayat Baca',
        desc: 'Rekam jejak transaksi peminjaman, persentase ketepatan waktu, dan kategori favorit.',
        actionLabel: 'Buka Statistik',
        onClick: () => onNavigateTab('history'),
      },
      {
        index: '06.',
        title: 'Profil & Panduan Layanan',
        desc: 'Informasi tata tertib sirkulasi, kuota anggota, jam layanan, dan kontak bantuan pustakawan.',
        actionLabel: 'Baca Panduan',
        onClick: () => onNavigateTab('profile'),
      },
    ];

    return (
      <div className="space-y-10">
        {/* Institutional Hero with Integrated OneSearch */}
        <section className="relative rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-[#0E1836] text-white">
          <img
            src={HERO_IMAGE_URL}
            alt="Atrium perpustakaan digital modern Kazyfi Library"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A132D]/95 via-[#13224E]/88 to-[#0E1836]/80" />

          <div className="relative z-10 px-6 py-10 sm:px-10 sm:py-14 max-w-4xl space-y-6">
            <div className="text-xs font-mono tracking-wider text-amber-300/95">
              PORTAL PERPUSTAKAAN DIGITAL · KAZYFI LIBRARY
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-[-0.02em] leading-[1.15] text-white text-balance">
              Pencarian Terpadu, Katalog OPAC, dan Ruang Baca Virtual dalam Satu Portal
            </h1>

            <p className="text-sm sm:text-base text-indigo-100/85 max-w-2xl leading-relaxed">
              Telusuri koleksi pustaka lintas {BOOK_CATEGORIES.length} bidang ilmu, baca pratinjau bab secara daring, ajukan peminjaman mandiri, dan pantau transaksi sirkulasi secara real-time.
            </p>

            {/* OneSearch Unified Search Bar */}
            <form
              onSubmit={handleHeroOneSearch}
              className="bg-white dark:bg-[#111723] p-2 rounded-xl border border-white/20 dark:border-slate-700 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            >
              <select
                aria-label="Filter bidang ilmu pencarian"
                value={heroCategory}
                onChange={(e) => setHeroCategory(e.target.value as 'Semua' | BookCategory)}
                className="px-3 py-2.5 text-xs sm:text-sm font-medium bg-[#F6F7FA] dark:bg-[#0B0F17] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-[#1A2B5E] sm:w-52 shrink-0"
              >
                <option value="Semua">Semua Bidang Ilmu</option>
                {BOOK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={heroSearchQuery}
                  onChange={(e) => setHeroSearchQuery(e.target.value)}
                  placeholder="Ketik judul buku, nama pengarang, atau nomor ISBN..."
                  aria-label="Cari di OneSearch Kazyfi Library"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cari Koleksi
              </button>
            </form>

            {/* Operational Utility Ribbon */}
            <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono tabular-nums text-indigo-100/85">
              <span>{books.length} Judul Terkurasi</span>
              <span aria-hidden="true" className="text-indigo-300/40">·</span>
              <span>
                {availableCopiesCount}/{totalCopiesCount} Eksemplar Tersedia
              </span>
              <span aria-hidden="true" className="text-indigo-300/40">·</span>
              <span>{BOOK_CATEGORIES.length} Bidang Ilmu</span>
              <span aria-hidden="true" className="text-indigo-300/40">·</span>
              <span>Sirkulasi Real-Time {sseConnected ? 'Aktif' : 'Sinkronisasi'}</span>
            </div>
          </div>
        </section>

        {/* Pintasan Platform Layanan Utama (6-Card Academic Portal Strip) */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-slate-50">
                Layanan & Platform Perpustakaan
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Akses langsung ke seluruh modul layanan akademik dan sirkulasi anggota Kazyfi Library.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {currentMember
                ? `${currentMember.name} · ${currentMember.memberCode}`
                : 'Pengunjung Tamu · Masuk untuk meminjam'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {platformShortcuts.map((item) => (
              <HoverPop
                key={item.index}
                className="h-full"
                placement="top"
                widthClass="w-72"
                content={
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#1A2B5E] dark:text-indigo-300">
                      <span>LAYANAN {item.index}</span>
                      <span>Klik untuk membuka</span>
                    </div>
                    <div className="text-xs font-bold text-slate-950 dark:text-slate-50">
                      {item.title}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                }
              >
                <button
                  type="button"
                  onClick={item.onClick}
                  className="w-full h-full text-left bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 hover:border-[#1A2B5E] dark:hover:border-indigo-500 rounded-xl p-5 flex flex-col justify-between gap-4 cursor-pointer group hover-pop"
                >
                  <div>
                    <div className="text-xs font-mono font-semibold text-[#1A2B5E] dark:text-indigo-400">
                      {item.index}
                    </div>
                    <h3 className="text-base font-bold text-slate-950 dark:text-slate-50 mt-1.5 group-hover:text-[#1A2B5E] dark:group-hover:text-indigo-300 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A2B5E] dark:text-indigo-400">
                    <span>{item.actionLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </button>
              </HoverPop>
            ))}
          </div>
        </section>

        {/* Ruang Baca Virtual (RBV) Editorial Feature Split */}
        <section className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-5 min-h-[240px]">
            <img
              src={READING_ROOM_IMAGE_URL}
              alt="Suasana membaca di Ruang Baca Virtual Kazyfi Library"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center space-y-4">
            <div className="text-xs font-mono tracking-wider text-slate-500 dark:text-slate-400">
              FASILITAS BACA DARING · RUANG BACA VIRTUAL
            </div>
            <h2 className="text-2xl font-bold text-slate-950 dark:text-slate-50 text-balance">
              Ruang Baca Virtual (RBV) dengan Pratinjau Teks & Pembaca Audio
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              Anggota dapat membaca cuplikan bab pembuka dari setiap buku koleksi sebelum meminjam salinan, lengkap dengan fitur pembaca suara berbahasa Indonesia untuk kenyamanan belajar yang inklusif.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigateTab('reading-room')}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>Buka Ruang Baca Virtual</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('catalog')}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Telusuri Katalog Lengkap</span>
              </button>
            </div>
          </div>
        </section>

        {/* Direktori 14 Bidang Ilmu */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-slate-50">
                Direktori Bidang Ilmu ({BOOK_CATEGORIES.length} Kategori)
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Pilih rumpun keilmuan untuk menelusuri koleksi referensi terkait di Katalog OPAC.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {BOOK_CATEGORIES.map((cat) => {
              const catBooks = books.filter((b) => b.category === cat);
              const count = categoryCounts.get(cat) ?? 0;
              const avail = catBooks.reduce((sum, b) => sum + b.availableCopies, 0);
              return (
                <HoverPop
                  key={cat}
                  className="h-full"
                  placement="top"
                  widthClass="w-72"
                  content={
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#1A2B5E] dark:text-indigo-300">
                          {cat}
                        </span>
                        <span className="text-[10px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {avail} eks. siap pinjam
                        </span>
                      </div>
                      {catBooks.length > 0 ? (
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                          <div className="text-slate-400 dark:text-slate-500">Contoh koleksi:</div>
                          {catBooks.slice(0, 2).map((b) => (
                            <div key={b.id} className="truncate font-medium">
                              · {b.title}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Klik untuk menelusuri kategori ini di Katalog OPAC.
                        </p>
                      )}
                    </div>
                  }
                >
                  <button
                    type="button"
                    onClick={() => openCategoryInCatalog(cat)}
                    className="w-full h-full bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 hover:border-[#1A2B5E] dark:hover:border-indigo-500 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover-pop"
                  >
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {cat}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {count} judul
                    </span>
                  </button>
                </HoverPop>
              );
            })}
          </div>
        </section>

        {/* Koleksi Pilihan & Terpopuler */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-slate-50">
                Sorotan Koleksi Pustaka
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Buku referensi yang paling banyak dipinjam dan dibaca oleh anggota.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('catalog')}
              className="text-xs font-semibold text-[#1A2B5E] dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer hover-pop-subtle"
            >
              Lihat Semua {books.length} Koleksi
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featuredBooks.map((book) => (
              <HoverPop
                key={`home-${book.id}`}
                className="h-full"
                placement="top"
                widthClass="w-80"
                content={renderBookHoverCard(book)}
              >
                <div
                  onClick={() => {
                    setModalTab('info');
                    setSelectedBookId(book.id);
                  }}
                  className="h-full bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 hover:border-[#1A2B5E] dark:hover:border-indigo-500 rounded-xl p-4 flex flex-col justify-between gap-3 cursor-pointer hover-pop"
                >
                  <div>
                    <div className="flex gap-3.5">
                      <BookCover
                        src={book.coverUrl}
                        title={book.title}
                        className="w-16 h-24 rounded-md shrink-0 border border-slate-200/80 dark:border-slate-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {book.category}
                        </div>
                        <h3 className="text-sm font-bold text-slate-950 dark:text-slate-50 mt-1 line-clamp-2 leading-snug">
                          {book.title}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 truncate">
                          {book.author}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-mono tabular-nums font-medium ${
                        book.availableCopies > 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {book.availableCopies > 0
                        ? `${book.availableCopies}/${book.totalCopies} tersedia`
                        : 'Stok habis'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalTab('info');
                        setSelectedBookId(book.id);
                      }}
                      className="font-semibold text-[#1A2B5E] dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Detail & Pinjam
                    </button>
                  </div>
                </div>
              </HoverPop>
            ))}
          </div>
        </section>

        {bookDetailModalNode}
        {finePaymentModalNode}
      </div>
    );
  }

  // =========================================================================
  // TAB: RUANG BACA VIRTUAL (RBV — Digital Reading Room)
  // =========================================================================
  if (activeTab === 'reading-room') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
              Ruang Baca Virtual (RBV)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Baca materi pembuka dan dengarkan narasi audio koleksi pustaka secara langsung sebelum melakukan peminjaman.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('catalog')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>Buka Katalog OPAC</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Index List */}
          <div className="lg:col-span-4 bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={rbvSearch}
                  onChange={(e) => setRbvSearch(e.target.value)}
                  placeholder="Cari bacaan di Ruang Baca..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[560px] overflow-y-auto">
              {filteredRbvBooks.map((book) => {
                const isSelected = activeRbvBook?.id === book.id;
                return (
                  <HoverPop
                    key={`rbv-${book.id}`}
                    placement="right"
                    widthClass="w-80"
                    content={renderBookHoverCard(book, 'Klik untuk membuka naskah di Ruang Baca')}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                          window.speechSynthesis.cancel();
                          setIsSpeaking(false);
                        }
                        setRbvSelectedId(book.id);
                      }}
                      className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/50'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <BookCover
                        src={book.coverUrl}
                        title={book.title}
                        className="w-11 h-16 rounded-xs shrink-0 border border-slate-200 dark:border-slate-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {book.category}
                        </div>
                        <div
                          className={`text-sm font-semibold mt-0.5 line-clamp-2 ${
                            isSelected
                              ? 'text-[#1A2B5E] dark:text-indigo-300'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {book.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {book.author}
                        </div>
                      </div>
                    </button>
                  </HoverPop>
                );
              })}
              {filteredRbvBooks.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Tidak ada koleksi yang sesuai kata kunci.
                </div>
              )}
            </div>
          </div>

          {/* Right Reading Canvas */}
          <div className="lg:col-span-8 bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
            {activeRbvBook ? (
              <>
                <div className="flex flex-col sm:flex-row gap-5 pb-6 border-b border-slate-200/80 dark:border-slate-800">
                  <BookCover
                    src={activeRbvBook.coverUrl}
                    title={activeRbvBook.title}
                    className="w-24 h-36 rounded-md shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {activeRbvBook.category} · {activeRbvBook.shelfCode} · ISBN {activeRbvBook.isbn}
                    </div>
                    <h2 className="text-2xl font-bold text-slate-950 dark:text-slate-50 leading-snug">
                      {activeRbvBook.title}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {activeRbvBook.author} · {activeRbvBook.publisher}, {activeRbvBook.year}
                    </p>
                    <div className="pt-2 flex flex-wrap items-center gap-2.5">
                      {typeof window !== 'undefined' && 'speechSynthesis' in window && (
                        <button
                          type="button"
                          onClick={() => toggleAudioReader(activeRbvBook, true)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isSpeaking
                              ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          {isSpeaking ? (
                            <>
                              <Square className="w-3.5 h-3.5 fill-current" />
                              <span>Hentikan Pembaca Audio</span>
                            </>
                          ) : (
                            <>
                              <Headphones className="w-3.5 h-3.5" />
                              <span>Dengarkan Materi</span>
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setModalTab('info');
                          setSelectedBookId(activeRbvBook.id);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Pinjam / Lihat Detail</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 max-w-2xl">
                  <div>
                    <h3 className="text-xs font-mono tracking-wider uppercase text-slate-500 dark:text-slate-400 mb-2">
                      Sinopsis Koleksi
                    </h3>
                    <p className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed">
                      {activeRbvBook.synopsis}
                    </p>
                  </div>

                  <div className="pt-5 border-t border-slate-200/80 dark:border-slate-800">
                    <h3 className="text-xs font-mono tracking-wider uppercase text-[#1A2B5E] dark:text-indigo-400 mb-3">
                      Naskah Cuplikan Bab Pembuka
                    </h3>
                    <div className="p-5 rounded-xl bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200/80 dark:border-slate-800">
                      <p className="text-[15px] text-slate-900 dark:text-slate-100 leading-[1.8]">
                        {activeRbvBook.sampleExcerpt || activeRbvBook.synopsis}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Belum ada koleksi yang tersedia di Ruang Baca Virtual.
              </p>
            )}
          </div>
        </div>

        {bookDetailModalNode}
        {finePaymentModalNode}
      </div>
    );
  }

  // =========================================================================
  // TAB 1: MEMBER CATALOG (OPAC), DIGITAL CARD & SELF-BORROWING
  // =========================================================================
  if (activeTab === 'catalog') {
    const visibleCategories = currentMember
      ? CATEGORIES
      : CATEGORIES.filter((c) => c !== 'Tersimpan');

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
              Katalog OPAC Kazyfi Library
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {currentMember ? (
                <>
                  Selamat membaca, {currentMember.name} · Kuota pinjaman aktif{' '}
                  <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                    {activeLoans.length}/3
                  </span>{' '}
                  buku.
                </>
              ) : (
                'Telusuri ketersediaan koleksi secara real-time · Masuk atau daftar sebagai anggota untuk meminjam buku.'
              )}
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

        {/* Integrated Digital Member Card & Personal Notification Banner (or Guest Auth Card) */}
        {currentMember ? (
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
        ) : (
          <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/80 dark:border-indigo-800 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50">
                  Masuk sebagai Anggota untuk Meminjam &amp; Mengakses Pinjaman Saya
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  Pengunjung dapat menelusuri Katalog OPAC dan Ruang Baca Virtual secara terbuka. Untuk meminjam buku, masuk antrean reservasi, atau membuka halaman Pinjaman Saya, silakan login atau daftar akun anggota baru.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1A2B5E] dark:text-indigo-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk Anggota</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Daftar Anggota</span>
              </button>
            </div>
          </div>
        )}

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
            {visibleCategories.map((cat) => {
              const catCount =
                cat === 'Semua'
                  ? books.length
                  : cat === 'Tersimpan'
                  ? bookmarkSet.size
                  : categoryCounts.get(cat) ?? 0;
              return (
                <HoverPop
                  key={cat}
                  as="span"
                  className="inline-flex shrink-0"
                  placement="top"
                  widthClass="w-56"
                  content={
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="font-bold text-[#1A2B5E] dark:text-indigo-300">
                        {cat}
                      </span>{' '}
                      · <span className="font-mono tabular-nums">{catCount} judul</span>
                    </div>
                  }
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer hover-pop-subtle ${
                      selectedCategory === cat
                        ? 'bg-[#1A2B5E] dark:bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cat === 'Tersimpan' ? `Tersimpan (${bookmarkSet.size})` : cat}
                  </button>
                </HoverPop>
              );
            })}
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
              <HoverPop
                key={book.id}
                className="h-full"
                placement="top"
                widthClass="w-80"
                content={renderBookHoverCard(
                  book,
                  alreadyBorrowed
                    ? 'Anda sedang meminjam buku ini'
                    : alreadyReserved
                    ? 'Anda sudah masuk antrean reservasi'
                    : outOfStock
                    ? 'Stok habis — klik untuk masuk antrean reservasi'
                    : 'Klik untuk pratinjau baca, ulasan, atau pinjam buku'
                )}
              >
                <div
                  onClick={() => {
                    setModalTab('info');
                    setSelectedBookId(book.id);
                  }}
                  className="h-full bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 flex gap-4 hover:border-[#1A2B5E] dark:hover:border-indigo-500 cursor-pointer hover-pop"
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
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!currentMember) {
                              onOpenAuth('login');
                              return;
                            }
                            onToggleBookmark(currentMember.id, book.id);
                          }}
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
                        onClick={(e) => {
                          e.stopPropagation();
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
              </HoverPop>
            );
          })}
        </div>

        {filteredBooks.length === 0 && (
          <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Tidak ada buku yang cocok dengan kata kunci atau filter yang dipilih.
          </div>
        )}

        {bookDetailModalNode}
        {finePaymentModalNode}
      </div>
    );
  }

  // =========================================================================
  // LOGIN GATE FOR MEMBER-ONLY TABS ('my-loans' & 'history')
  // =========================================================================
  if ((activeTab === 'my-loans' || activeTab === 'history') && !currentMember) {
    const isLoansPage = activeTab === 'my-loans';
    return (
      <div className="py-6 sm:py-10">
        <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-7 sm:p-10 max-w-2xl mx-auto text-center space-y-6 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/80 dark:border-indigo-800 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-[#1A2B5E] dark:text-indigo-400" />
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-mono tracking-wider uppercase text-[#1A2B5E] dark:text-indigo-400 font-semibold">
              Akses Anggota Terdaftar
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
              {isLoansPage
                ? 'Halaman Pinjaman Saya Memerlukan Login'
                : 'Statistik & Riwayat Memerlukan Login'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg mx-auto">
              {isLoansPage
                ? 'Untuk menjaga privasi data sirkulasi Anda, halaman Pinjaman Saya, perpanjangan, antrean reservasi, dan pembayaran denda Bank/QRIS hanya dapat diakses setelah masuk ke akun anggota.'
                : 'Statistik baca, ketepatan waktu pengembalian, dan daftar riwayat transaksi pribadi hanya tersedia setelah Anda masuk ke akun anggota.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer hover-pop-subtle"
            >
              <LogIn className="w-4 h-4" />
              <span>Masuk Akun Anggota</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#1A2B5E] dark:text-indigo-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer hover-pop-subtle"
            >
              <UserPlus className="w-4 h-4" />
              <span>Daftar Anggota Baru</span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => onOpenAuth('activate')}
              className="font-medium text-[#1A2B5E] dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Aktivasi sandi anggota lama
            </button>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <button
              type="button"
              onClick={() => onNavigateTab('catalog')}
              className="font-medium text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
            >
              Kembali ke Katalog OPAC
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // TAB 2: MY ACTIVE LOANS & RESERVATION QUEUE
  // =========================================================================
  if (activeTab === 'my-loans' && currentMember) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
              Pinjaman, Denda & Reservasi Saya
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Pantau tenggat pengembalian, perpanjang masa pinjam, bayar denda via Rekening/QRIS, atau kelola antrean reservasi buku.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab('history')}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <History className="w-4 h-4" />
              <span>Statistik & Riwayat</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('catalog')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>Jelajahi Katalog</span>
            </button>
          </div>
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
                        <span
                          className={`text-xs font-medium ${
                            isPending
                              ? 'text-amber-700 dark:text-amber-300'
                              : isRejected
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          ·{' '}
                          {isPending
                            ? 'Menunggu Verifikasi Admin'
                            : isRejected
                            ? 'Bukti Ditolak'
                            : 'Belum Dibayar'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {loan.status === 'returned'
                          ? `Dikembalikan ${formatDateId(loan.returnedAt)}`
                          : 'Pinjaman masih berjalan · Tarif denda Rp 2.000/hari'}
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
              <HoverPop
                key={loan.id}
                className="h-full"
                placement="top"
                widthClass="w-80"
                content={
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="text-[#1A2B5E] dark:text-indigo-300 font-semibold">
                        {loan.loanCode}
                      </span>
                      <span className={isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}>
                        {getDueCountdownText(loan.dueAt, loan.status)}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-950 dark:text-slate-50">
                      {loan.bookTitle}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {hasUnpaidFine
                        ? `Terdapat denda ${formatRupiah(loan.fineAmount)} (Rp 2.000/hari). Klik Bayar Denda untuk transfer rekening atau QRIS Kazyfi.`
                        : loan.extendedCount === 0 && !isOverdue
                        ? 'Pinjaman masih memenuhi syarat untuk diperpanjang +7 hari secara mandiri.'
                        : 'Pinjaman sedang aktif. Kembalikan tepat waktu untuk menjaga skor ketepatan Anda.'}
                    </p>
                  </div>
                }
              >
                <div className="h-full bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 hover:border-[#1A2B5E] dark:hover:border-indigo-500 rounded-xl p-5 flex gap-4 justify-between hover-pop">
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
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
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
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Kembalikan Buku
                    </button>
                  </div>
                </div>
                </div>
              </HoverPop>
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
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Pinjam Sekarang
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onCancelReservation(resv.id)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
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
  // TAB: PROFIL & PANDUAN LAYANAN PERPUSTAKAAN
  // =========================================================================
  if (activeTab === 'profile') {
    return (
      <div className="space-y-8">
        <div className="pb-5 border-b border-slate-200/90 dark:border-slate-800">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
            Profil & Panduan Layanan Kazyfi Library
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Informasi kelembagaan, peraturan sirkulasi, ketentuan denda, dan jadwal operasional perpustakaan digital.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2.5 text-[#1A2B5E] dark:text-indigo-400">
                <Library className="w-5 h-5" />
                <h2 className="text-base font-bold text-slate-950 dark:text-slate-50">
                  Tentang Kazyfi Library
                </h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Kazyfi Library merupakan perpustakaan digital terintegrasi yang dirancang untuk mempermudah akses referensi lintas {BOOK_CATEGORIES.length} bidang keilmuan. Sistem ini menggabungkan Katalog OPAC real-time, Ruang Baca Virtual (RBV) dengan pembaca audio inklusif, peminjaman dan antrean reservasi daring, serta verifikasi pembayaran denda elektronik melalui transfer rekening bank dan QRIS.
              </p>
            </div>

            <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-950 dark:text-slate-50">
                Tata Tertib Sirkulasi & Peminjaman
              </h2>
              <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                <div className="py-3 flex flex-wrap justify-between gap-2">
                  <dt className="font-medium text-slate-700 dark:text-slate-300">Kuota Pinjaman Aktif</dt>
                  <dd className="font-mono font-semibold text-slate-950 dark:text-slate-50">
                    Maksimal 3 buku per anggota
                  </dd>
                </div>
                <div className="py-3 flex flex-wrap justify-between gap-2">
                  <dt className="font-medium text-slate-700 dark:text-slate-300">Durasi Peminjaman</dt>
                  <dd className="font-mono font-semibold text-slate-950 dark:text-slate-50">
                    7 hari atau 14 hari kalender
                  </dd>
                </div>
                <div className="py-3 flex flex-wrap justify-between gap-2">
                  <dt className="font-medium text-slate-700 dark:text-slate-300">Perpanjangan Mandiri</dt>
                  <dd className="font-mono font-semibold text-slate-950 dark:text-slate-50">
                    1 kali (+7 hari) sebelum jatuh tempo
                  </dd>
                </div>
                <div className="py-3 flex flex-wrap justify-between gap-2">
                  <dt className="font-medium text-slate-700 dark:text-slate-300">Tarif Denda Keterlambatan</dt>
                  <dd className="font-mono font-semibold text-red-600 dark:text-red-400">
                    Rp 2.000 / hari / buku
                  </dd>
                </div>
                <div className="py-3 flex flex-wrap justify-between gap-2">
                  <dt className="font-medium text-slate-700 dark:text-slate-300">Kanal Pembayaran Denda</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    Transfer Bank (BCA, Mandiri, BRI) & QRIS Dinamis
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-950 dark:text-slate-50">
                Jam Operasional & Bantuan
              </h2>
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Sirkulasi Fisik & Verifikasi
                    </div>
                    <div className="text-xs mt-0.5">Senin–Jumat: 08.00–21.00 WIB · Sabtu: 09.00–17.00 WIB</div>
                    <div className="text-xs mt-0.5">Portal OPAC & Ruang Baca Virtual: 24 Jam Daring</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Gedung Pusat Literasi Kazyfi
                    </div>
                    <div className="text-xs mt-0.5">Jakarta Timur · Layanan Perpustakaan Terbuka</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Meja Referensi & Sirkulasi
                    </div>
                    <div className="text-xs font-mono mt-0.5">layanan@kazyfilibrary.id</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Pusat Informasi Anggota
                    </div>
                    <div className="text-xs font-mono mt-0.5">(021) 800-4520 · Ekstensi 102</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#1A2B5E] text-white rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold">Butuh Mulai Mencari Koleksi?</h3>
              <p className="text-xs text-indigo-100/85 leading-relaxed">
                Gunakan Katalog OPAC untuk mengecek stok salinan secara real-time atau buka Ruang Baca Virtual untuk membaca cuplikan buku.
              </p>
              <div className="pt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('catalog')}
                  className="px-3.5 py-2 text-xs font-semibold bg-white text-[#1A2B5E] hover:bg-indigo-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  Buka Katalog OPAC
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('reading-room')}
                  className="px-3.5 py-2 text-xs font-semibold border border-white/30 text-white hover:bg-white/10 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  Masuk Ruang Baca
                </button>
              </div>
            </div>
          </div>
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
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
            Statistik & Riwayat Peminjaman
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Ringkasan aktivitas membaca pribadi untuk {currentMember?.name} ({currentMember?.memberCode}).
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab('my-loans')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Receipt className="w-4 h-4" />
          <span>Kelola Pinjaman & Denda</span>
        </button>
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
            {currentMember?.department}
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
