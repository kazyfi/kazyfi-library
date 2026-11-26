import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import type {
  ActivityEvent,
  AutomatedReport,
  Book,
  BookCategory,
  BookReview,
  CategoryDistributionPoint,
  DailyCirculationPoint,
  FinePaymentMethod,
  FinePaymentProof,
  LibraryStatistics,
  Loan,
  Member,
  ReportFrequency,
  ReportKind,
  ReportSchedule,
  Reservation,
  UserRole,
} from '../src/types/library.ts';

dotenv.config();

const FINE_PER_DAY = 2000;
const MAX_ACTIVE_LOANS_PER_MEMBER = 3;
const IS_VERCEL = process.env.VERCEL === '1';
const DATA_DIR = IS_VERCEL
  ? path.resolve('/tmp', 'kazyfi-library-data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'library-db.json');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface AdminCredential {
  username: string;
  passwordHash: string;
  salt: string;
  updatedAt: string;
}

interface DatabaseState {
  books: Book[];
  members: Member[];
  loans: Loan[];
  reservations: Reservation[];
  reviews: BookReview[];
  activities: ActivityEvent[];
  reports: AutomatedReport[];
  reportSchedule: ReportSchedule;
  adminCredential?: AdminCredential | null;
}

interface SessionPayload {
  role: UserRole;
  userId: string;
  name: string;
  email: string;
  code: string;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  session?: SessionPayload;
}

const VALID_CATEGORIES: BookCategory[] = [
  'Filsafat & Sejarah',
  'Arsitektur & Desain',
  'Teknologi & Data',
  'Sastra & Fiksi',
  'Ekonomi & Bisnis',
  'Sains & Astronomi',
];

const DEFAULT_EXCERPTS: Record<string, string> = {
  'bk-001':
    'Bab 1 — Cakrawala Bahari: Sebelum peta-peta modern digambar dengan proyeksi garis lintang, para pelaut Nusantara membaca arah angin muson, warna arus selat, dan gugus bintang sebagai satu sistem pengetahuan hidup yang diwariskan lintas generasi.',
  'bk-002':
    'Bab 1 — Bernapas Bersama Iklim: Bangunan di garis khatulistiwa tidak dirancang untuk melawan matahari dan hujan tropis, melainkan bernegosiasi melalui teritisan lebar, kisi-kisi kayu yang menyaring silau, serta halaman dalam yang mengalirkan udara sejuk.',
  'bk-003':
    'Bab 1 — Konsistensi dalam Skala Besar: Ketika jutaan permintaan datang bersamaan ke simpul yang tersebar secara geografis, keandalan sistem bukan lagi sekadar soal kecepatan prosesor, melainkan bagaimana struktur data menjaga keteraturan tanpa mengorbankan ketersediaan.',
  'bk-004':
    'Bagian Pertama — Laci Arsip Nomor Tujuh: Setiap sore pukul lima, ketika kapal penyeberangan terakhir merapat di dermaga barat, Damar membuka laci arsip kayu jati dan menata surat-surat lama yang tintanya masih menyimpan bau garam laut.',
  'bk-005':
    'Bab 1 — Melampaui Ekonomi Linear: Selama satu abad terakhir, industri beroperasi dalam pola ambil-olah-buang. Model sirkular membalik logika tersebut dengan memperlakukan limbah sebagai bahan baku bernilai tinggi yang memperpanjang umur ekosistem.',
  'bk-006':
    'Bab 1 — Mengukur Jarak Bintang: Cahaya yang menyentuh lensa observatorium malam ini telah menempuh perjalanan ribuan tahun melintasi ruang hampa, membawa rekaman komposisi kimia dan sejarah evolusi galaksi jauh.',
  'bk-007':
    'Bab 1 — Arsitektur Berbasis Kejadian: Dalam sistem informasi modern, mencatat perubahan keadaan sebagai aliran kejadian yang tidak dapat diubah memberi transparansi audit penuh sekaligus memampukan pembaruan antarmuka secara seketika.',
  'bk-008':
    'Bab 1 — Ruang Bersama di Tengah Kota: Alun-alun, selasar pasar, dan taman tepi sungai di Asia Tenggara selalu menjadi ruang demokratis tempat warga lintas usia dan latar belakang bertemu tanpa sekat ekonomi.',
};

function daysFromNow(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}

function calculateDaysLate(dueAtIso: string, referenceDate: Date = new Date()): number {
  const dueTime = new Date(dueAtIso).getTime();
  const diffMs = referenceDate.getTime() - dueTime;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function reconcileLoansAndBooks(state: DatabaseState): void {
  const now = new Date();
  const activeCountByBook = new Map<string, number>();

  for (const loan of state.loans) {
    if (loan.returnedAt) {
      loan.status = 'returned';
      continue;
    }
    const lateDays = calculateDaysLate(loan.dueAt, now);
    if (lateDays > 0) {
      loan.status = 'overdue';
      if (!loan.finePaid) {
        loan.fineAmount = lateDays * FINE_PER_DAY;
      }
    } else {
      loan.status = 'active';
      loan.fineAmount = 0;
    }
    activeCountByBook.set(loan.bookId, (activeCountByBook.get(loan.bookId) ?? 0) + 1);
  }

  const reviewStats = new Map<string, { sum: number; count: number }>();
  for (const rev of state.reviews) {
    const prev = reviewStats.get(rev.bookId) ?? { sum: 0, count: 0 };
    prev.sum += rev.rating;
    prev.count += 1;
    reviewStats.set(rev.bookId, prev);
  }

  for (const book of state.books) {
    const activeBorrowed = activeCountByBook.get(book.id) ?? 0;
    book.availableCopies = Math.max(0, book.totalCopies - activeBorrowed);
    if (!book.sampleExcerpt) {
      book.sampleExcerpt =
        DEFAULT_EXCERPTS[book.id] ||
        `Cuplikan Pembuka — ${book.title}: ${book.synopsis}`;
    }
    const rStat = reviewStats.get(book.id);
    book.ratingCount = rStat?.count ?? 0;
    book.ratingAvg = rStat && rStat.count > 0 ? Number((rStat.sum / rStat.count).toFixed(1)) : 0;
  }
}

function computeStatistics(state: DatabaseState): LibraryStatistics {
  reconcileLoansAndBooks(state);
  const totalTitles = state.books.length;
  const totalCopies = state.books.reduce((sum, b) => sum + b.totalCopies, 0);
  const availableCopies = state.books.reduce((sum, b) => sum + b.availableCopies, 0);
  const activeLoans = state.loans.filter((l) => l.status === 'active' || l.status === 'overdue');
  const overdueLoans = state.loans.filter((l) => l.status === 'overdue');
  const returnedLoans = state.loans.filter((l) => l.status === 'returned');
  const activeMembersCount = state.members.filter((m) => m.status === 'active').length;
  const waitingReservationsCount = state.reservations.filter(
    (r) => r.status === 'waiting' || r.status === 'ready'
  ).length;

  const borrowedCopies = Math.max(0, totalCopies - availableCopies);
  const utilizationRate = totalCopies > 0 ? Math.round((borrowedCopies / totalCopies) * 100) : 0;

  const onTimeReturns = returnedLoans.filter((l) => l.fineAmount === 0).length;
  const onTimeReturnRate =
    returnedLoans.length > 0 ? Math.round((onTimeReturns / returnedLoans.length) * 100) : 100;

  const totalOutstandingFines = state.loans
    .filter((l) => !l.finePaid && l.fineAmount > 0)
    .reduce((sum, l) => sum + l.fineAmount, 0);

  const dailyTrend: DailyCirculationPoint[] = [];
  const dayFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric' });
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const nextD = new Date(d);
    nextD.setDate(d.getDate() + 1);
    const dayKey = d.toISOString().slice(0, 10);

    const borrowed = state.loans.filter((l) => {
      const t = new Date(l.borrowedAt).getTime();
      return t >= d.getTime() && t < nextD.getTime();
    }).length;

    const returned = state.loans.filter((l) => {
      if (!l.returnedAt) return false;
      const t = new Date(l.returnedAt).getTime();
      return t >= d.getTime() && t < nextD.getTime();
    }).length;

    dailyTrend.push({
      date: dayKey,
      label: dayFormatter.format(d),
      borrowed,
      returned,
    });
  }

  const catMap = new Map<string, CategoryDistributionPoint>();
  for (const cat of VALID_CATEGORIES) {
    catMap.set(cat, { category: cat, titles: 0, totalCopies: 0, borrowedCount: 0 });
  }
  for (const book of state.books) {
    const entry = catMap.get(book.category) ?? {
      category: book.category,
      titles: 0,
      totalCopies: 0,
      borrowedCount: 0,
    };
    entry.titles += 1;
    entry.totalCopies += book.totalCopies;
    entry.borrowedCount += book.borrowCount;
    catMap.set(book.category, entry);
  }
  const categoryDistribution = Array.from(catMap.values()).filter((c) => c.titles > 0);

  const topBooks = [...state.books]
    .sort((a, b) => b.borrowCount - a.borrowCount)
    .slice(0, 5)
    .map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      category: b.category,
      borrowCount: b.borrowCount,
      availableCopies: b.availableCopies,
      totalCopies: b.totalCopies,
    }));

  return {
    totalTitles,
    totalCopies,
    availableCopies,
    activeLoansCount: activeLoans.length,
    overdueLoansCount: overdueLoans.length,
    returnedLoansCount: returnedLoans.length,
    activeMembersCount,
    waitingReservationsCount,
    utilizationRate,
    onTimeReturnRate,
    totalOutstandingFines,
    dailyTrend,
    categoryDistribution,
    topBooks,
  };
}

function buildReportSnapshot(
  state: DatabaseState,
  kind: ReportKind,
  trigger: 'auto' | 'manual',
  generatedBy: string
): AutomatedReport {
  const now = new Date();
  const stats = computeStatistics(state);
  const periodDays = kind === 'Bulanan' ? 30 : kind === 'Mingguan' ? 7 : 1;
  const periodStartDate = new Date(now);
  periodStartDate.setDate(now.getDate() - periodDays);

  const borrowedInPeriod = state.loans.filter(
    (l) => new Date(l.borrowedAt).getTime() >= periodStartDate.getTime()
  ).length;
  const returnedInPeriod = state.loans.filter(
    (l) => l.returnedAt && new Date(l.returnedAt).getTime() >= periodStartDate.getTime()
  ).length;

  const overdueSnapshot = state.loans
    .filter((l) => l.status === 'overdue')
    .map((l) => ({
      loanCode: l.loanCode,
      bookTitle: l.bookTitle,
      memberName: l.memberName,
      daysLate: calculateDaysLate(l.dueAt, now),
      estimatedFine: l.fineAmount,
    }));

  const reportNum = String(state.reports.length + 1).padStart(3, '0');
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');

  const kindLabelMap: Record<ReportKind, string> = {
    Harian: 'Laporan Sirkulasi Harian',
    Mingguan: 'Laporan Rekapitulasi Mingguan',
    Bulanan: 'Laporan Statistik Bulanan',
    'Audit Keterlambatan': 'Audit Keterlambatan & Denda',
    Otomatis: 'Laporan Otomatis Terjadwal',
  };

  return {
    id: `rep-${crypto.randomUUID().slice(0, 8)}`,
    reportCode: `LAP-${datePart}-${reportNum}`,
    title: kindLabelMap[kind],
    kind,
    trigger,
    generatedBy,
    generatedAt: now.toISOString(),
    periodStart: periodStartDate.toISOString(),
    periodEnd: now.toISOString(),
    metrics: {
      totalTitles: stats.totalTitles,
      totalCopies: stats.totalCopies,
      availableCopies: stats.availableCopies,
      activeLoans: stats.activeLoansCount,
      overdueLoans: stats.overdueLoansCount,
      returnedInPeriod,
      borrowedInPeriod,
      onTimeRate: stats.onTimeReturnRate,
      utilizationRate: stats.utilizationRate,
      totalAccruedFines: stats.totalOutstandingFines,
    },
    topBooks: stats.topBooks.slice(0, 3).map((b) => ({
      bookId: b.id,
      title: b.title,
      author: b.author,
      borrowCount: b.borrowCount,
    })),
    overdueSnapshot,
  };
}

function createInitialSeedState(): DatabaseState {
  const books: Book[] = [
    {
      id: 'bk-001',
      isbn: '978-602-481-104-2',
      title: 'Sejarah Pemikiran Nusantara',
      author: 'Prof. Dr. Hendra Wijaya',
      publisher: 'Pustaka Cendekia',
      year: 2023,
      category: 'Filsafat & Sejarah',
      shelfCode: 'RAK-A1',
      totalCopies: 5,
      availableCopies: 3,
      coverUrl: '/src/assets/images/cover_filsafat_nusantara_1795659500953.jpg',
      synopsis:
        'Penelusuran mendalam mengenai perkembangan gagasan maritim, etika sosial, dan tradisi intelektual di kepulauan Nusantara dari abad ke-14 hingga era modern.',
      sampleExcerpt: DEFAULT_EXCERPTS['bk-001'],
      borrowCount: 28,
      createdAt: daysFromNow(-120),
    },
    {
      id: 'bk-002',
      isbn: '978-602-851-392-0',
      title: 'Arsitektur Tropis Kontemporer',
      author: 'Ar. Larasati Kusuma',
      publisher: 'Balai Rupa Press',
      year: 2024,
      category: 'Arsitektur & Desain',
      shelfCode: 'RAK-B2',
      totalCopies: 4,
      availableCopies: 3,
      coverUrl: '/src/assets/images/cover_arsitektur_tropis_1795659501240.jpg',
      synopsis:
        'Kajian prinsip ventilasi silang, pencahayaan alami, serta material lokal berkelanjutan dalam perancangan ruang publik dan hunian iklim khatulistiwa.',
      sampleExcerpt: DEFAULT_EXCERPTS['bk-002'],
      borrowCount: 19,
      createdAt: daysFromNow(-95),
    },
    {
      id: 'bk-003',
      isbn: '978-623-712-084-5',
      title: 'Struktur Data & Algoritma Terdistribusi',
      author: 'Dr. Bagas Pradipta',
      publisher: 'Informatika Mandiri',
      year: 2025,
      category: 'Teknologi & Data',
      shelfCode: 'RAK-C4',
      totalCopies: 6,
      availableCopies: 4,
      coverUrl: '/src/assets/images/cover_algoritma_data_1795659501461.jpg',
      synopsis:
        'Panduan praktis perancangan struktur graf, indeks pencarian, konsistensi terdistribusi, serta optimasi komputasi berskala besar.',
      sampleExcerpt: DEFAULT_EXCERPTS['bk-003'],
      borrowCount: 34,
      createdAt: daysFromNow(-80),
    },
    {
      id: 'bk-004',
      isbn: '978-602-039-441-8',
      title: 'Senja di Pelabuhan Sunyi',
      author: 'Ratna Sari Dewi',
      publisher: 'Lentera Aksara',
      year: 2022,
      category: 'Sastra & Fiksi',
      shelfCode: 'RAK-D1',
      totalCopies: 4,
      availableCopies: 3,
      coverUrl: '/src/assets/images/cover_sastra_senja_1795659501618.jpg',
      synopsis:
        'Novel sastra tentang perjalanan seorang pustakawan pesisir yang merawat arsip surat-surat tua dan ingatan kolektif kota pelabuhan.',
      sampleExcerpt: DEFAULT_EXCERPTS['bk-004'],
      borrowCount: 25,
      createdAt: daysFromNow(-70),
    },
    {
      id: 'bk-005',
      isbn: '978-623-554-210-1',
      title: 'Ekonomi Sirkular & Kebijakan Hijau',
      author: 'Dr. Aditya Mahendra',
      publisher: 'Gema Ekonomi',
      year: 2024,
      category: 'Ekonomi & Bisnis',
      shelfCode: 'RAK-E3',
      totalCopies: 3,
      availableCopies: 2,
      coverUrl: '/src/assets/images/cover_ekonomi_hijau_1795659501820.jpg',
      synopsis:
        'Analisis transisi energi, rantai pasok rendah karbon, dan instrumen pembiayaan berkelanjutan untuk negara berkembang.',
      sampleExcerpt: DEFAULT_EXCERPTS['bk-005'],
      borrowCount: 16,
      createdAt: daysFromNow(-55),
    },
    {
      id: 'bk-006',
      isbn: '978-602-424-882-7',
      title: 'Peta Kosmos & Mekanika Langit',
      author: 'Prof. Nirmala Putra',
      publisher: 'Observatorium Nusantara',
      year: 2025,
      category: 'Sains & Astronomi',
      shelfCode: 'RAK-F1',
      totalCopies: 4,
      availableCopies: 4,
      coverUrl: '/src/assets/images/cover_astronomi_kosmos_1795659502173.jpg',
      synopsis:
        'Pengantar astrofisika observasional, dinamika orbit planet, dan pemetaan katalog bintang di belahan langit selatan.',
      sampleExcerpt: DEFAULT_EXCERPTS['bk-006'],
      borrowCount: 21,
      createdAt: daysFromNow(-40),
    },
    {
      id: 'bk-007',
      isbn: '978-623-008-551-9',
      title: 'Sistem Basis Data Modern & Arsitektur Event',
      author: 'Dimas Setiawan, M.Kom.',
      publisher: 'Informatika Mandiri',
      year: 2024,
      category: 'Teknologi & Data',
      shelfCode: 'RAK-C2',
      totalCopies: 3,
      availableCopies: 2,
      coverUrl: '/src/assets/images/cover_algoritma_data_1795659501461.jpg',
      synopsis:
        'Membahas pemodelan data transaksional, replikasi real-time, serta strategi audit log untuk sistem informasi organisasi.',
      sampleExcerpt: DEFAULT_EXCERPTS['bk-007'],
      borrowCount: 22,
      createdAt: daysFromNow(-30),
    },
    {
      id: 'bk-008',
      isbn: '978-602-199-731-4',
      title: 'Tata Kota & Ruang Komunal Asia Tenggara',
      author: 'Ir. Kemal Santoso',
      publisher: 'Balai Rupa Press',
      year: 2021,
      category: 'Arsitektur & Desain',
      shelfCode: 'RAK-B5',
      totalCopies: 2,
      availableCopies: 2,
      coverUrl: '/src/assets/images/cover_arsitektur_tropis_1795659501240.jpg',
      synopsis:
        'Studi komparatif ruang terbuka hijau, koridor pejalan kaki, dan revitalisasi kawasan bersejarah di kota-kota Asia Tenggara.',
      sampleExcerpt: DEFAULT_EXCERPTS['bk-008'],
      borrowCount: 12,
      createdAt: daysFromNow(-20),
    },
  ];

  const members: Member[] = [
    {
      id: 'mem-001',
      memberCode: 'AGT-2026-001',
      name: 'Budi Santoso',
      email: 'budi.santoso@kazyfilibrary.id',
      department: 'Teknik Informatika',
      status: 'active',
      bookmarkIds: ['bk-002', 'bk-006'],
      joinedAt: daysFromNow(-180),
    },
    {
      id: 'mem-002',
      memberCode: 'AGT-2026-002',
      name: 'Nadia Putri',
      email: 'nadia.putri@kazyfilibrary.id',
      department: 'Arsitektur',
      status: 'active',
      bookmarkIds: ['bk-001', 'bk-008'],
      joinedAt: daysFromNow(-145),
    },
    {
      id: 'mem-003',
      memberCode: 'AGT-2026-003',
      name: 'Raka Pratama',
      email: 'raka.pratama@kazyfilibrary.id',
      department: 'Ilmu Ekonomi',
      status: 'active',
      bookmarkIds: ['bk-005'],
      joinedAt: daysFromNow(-90),
    },
    {
      id: 'mem-004',
      memberCode: 'AGT-2026-004',
      name: 'Dewi Anggraini',
      email: 'dewi.anggraini@kazyfilibrary.id',
      department: 'Sastra Indonesia',
      status: 'active',
      bookmarkIds: ['bk-004'],
      joinedAt: daysFromNow(-60),
    },
  ];

  const loans: Loan[] = [
    {
      id: 'ln-001',
      loanCode: 'PJM-2611-001',
      bookId: 'bk-001',
      bookTitle: 'Sejarah Pemikiran Nusantara',
      bookAuthor: 'Prof. Dr. Hendra Wijaya',
      bookIsbn: '978-602-481-104-2',
      memberId: 'mem-001',
      memberName: 'Budi Santoso',
      memberCode: 'AGT-2026-001',
      borrowedAt: daysFromNow(-4),
      dueAt: daysFromNow(3),
      returnedAt: null,
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'active',
    },
    {
      id: 'ln-002',
      loanCode: 'PJM-2611-002',
      bookId: 'bk-003',
      bookTitle: 'Struktur Data & Algoritma Terdistribusi',
      bookAuthor: 'Dr. Bagas Pradipta',
      bookIsbn: '978-623-712-084-5',
      memberId: 'mem-001',
      memberName: 'Budi Santoso',
      memberCode: 'AGT-2026-001',
      borrowedAt: daysFromNow(-10),
      dueAt: daysFromNow(-3),
      returnedAt: null,
      extendedCount: 0,
      fineAmount: 6000,
      finePaid: false,
      status: 'overdue',
    },
    {
      id: 'ln-003',
      loanCode: 'PJM-2611-003',
      bookId: 'bk-002',
      bookTitle: 'Arsitektur Tropis Kontemporer',
      bookAuthor: 'Ar. Larasati Kusuma',
      bookIsbn: '978-602-851-392-0',
      memberId: 'mem-002',
      memberName: 'Nadia Putri',
      memberCode: 'AGT-2026-002',
      borrowedAt: daysFromNow(-2),
      dueAt: daysFromNow(5),
      returnedAt: null,
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'active',
    },
    {
      id: 'ln-004',
      loanCode: 'PJM-2611-004',
      bookId: 'bk-004',
      bookTitle: 'Senja di Pelabuhan Sunyi',
      bookAuthor: 'Ratna Sari Dewi',
      bookIsbn: '978-602-039-441-8',
      memberId: 'mem-004',
      memberName: 'Dewi Anggraini',
      memberCode: 'AGT-2026-004',
      borrowedAt: daysFromNow(-1),
      dueAt: daysFromNow(6),
      returnedAt: null,
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'active',
    },
    {
      id: 'ln-005',
      loanCode: 'PJM-2611-005',
      bookId: 'bk-005',
      bookTitle: 'Ekonomi Sirkular & Kebijakan Hijau',
      bookAuthor: 'Dr. Aditya Mahendra',
      bookIsbn: '978-623-554-210-1',
      memberId: 'mem-003',
      memberName: 'Raka Pratama',
      memberCode: 'AGT-2026-003',
      borrowedAt: daysFromNow(-9),
      dueAt: daysFromNow(-2),
      returnedAt: null,
      extendedCount: 0,
      fineAmount: 4000,
      finePaid: false,
      status: 'overdue',
    },
    {
      id: 'ln-006',
      loanCode: 'PJM-2611-006',
      bookId: 'bk-007',
      bookTitle: 'Sistem Basis Data Modern & Arsitektur Event',
      bookAuthor: 'Dimas Setiawan, M.Kom.',
      bookIsbn: '978-623-008-551-9',
      memberId: 'mem-002',
      memberName: 'Nadia Putri',
      memberCode: 'AGT-2026-002',
      borrowedAt: daysFromNow(-3),
      dueAt: daysFromNow(11),
      returnedAt: null,
      extendedCount: 1,
      fineAmount: 0,
      finePaid: false,
      status: 'active',
    },
    {
      id: 'ln-007',
      loanCode: 'PJM-2611-007',
      bookId: 'bk-001',
      bookTitle: 'Sejarah Pemikiran Nusantara',
      bookAuthor: 'Prof. Dr. Hendra Wijaya',
      bookIsbn: '978-602-481-104-2',
      memberId: 'mem-003',
      memberName: 'Raka Pratama',
      memberCode: 'AGT-2026-003',
      borrowedAt: daysFromNow(-5),
      dueAt: daysFromNow(2),
      returnedAt: null,
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'active',
    },
    {
      id: 'ln-008',
      loanCode: 'PJM-2611-008',
      bookId: 'bk-003',
      bookTitle: 'Struktur Data & Algoritma Terdistribusi',
      bookAuthor: 'Dr. Bagas Pradipta',
      bookIsbn: '978-623-712-084-5',
      memberId: 'mem-004',
      memberName: 'Dewi Anggraini',
      memberCode: 'AGT-2026-004',
      borrowedAt: daysFromNow(-1),
      dueAt: daysFromNow(6),
      returnedAt: null,
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'active',
    },
    {
      id: 'ln-009',
      loanCode: 'PJM-2611-009',
      bookId: 'bk-006',
      bookTitle: 'Peta Kosmos & Mekanika Langit',
      bookAuthor: 'Prof. Nirmala Putra',
      bookIsbn: '978-602-424-882-7',
      memberId: 'mem-001',
      memberName: 'Budi Santoso',
      memberCode: 'AGT-2026-001',
      borrowedAt: daysFromNow(-6),
      dueAt: daysFromNow(1),
      returnedAt: daysFromNow(-1),
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'returned',
    },
    {
      id: 'ln-010',
      loanCode: 'PJM-2611-010',
      bookId: 'bk-008',
      bookTitle: 'Tata Kota & Ruang Komunal Asia Tenggara',
      bookAuthor: 'Ir. Kemal Santoso',
      bookIsbn: '978-602-199-731-4',
      memberId: 'mem-002',
      memberName: 'Nadia Putri',
      memberCode: 'AGT-2026-002',
      borrowedAt: daysFromNow(-5),
      dueAt: daysFromNow(2),
      returnedAt: daysFromNow(-2),
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'returned',
    },
    {
      id: 'ln-011',
      loanCode: 'PJM-2611-011',
      bookId: 'bk-004',
      bookTitle: 'Senja di Pelabuhan Sunyi',
      bookAuthor: 'Ratna Sari Dewi',
      bookIsbn: '978-602-039-441-8',
      memberId: 'mem-003',
      memberName: 'Raka Pratama',
      memberCode: 'AGT-2026-003',
      borrowedAt: daysFromNow(-4),
      dueAt: daysFromNow(3),
      returnedAt: daysFromNow(0),
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'returned',
    },
    {
      id: 'ln-012',
      loanCode: 'PJM-2611-012',
      bookId: 'bk-007',
      bookTitle: 'Sistem Basis Data Modern & Arsitektur Event',
      bookAuthor: 'Dimas Setiawan, M.Kom.',
      bookIsbn: '978-623-008-551-9',
      memberId: 'mem-001',
      memberName: 'Budi Santoso',
      memberCode: 'AGT-2026-001',
      borrowedAt: daysFromNow(-3),
      dueAt: daysFromNow(4),
      returnedAt: daysFromNow(0),
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'returned',
    },
  ];

  const reviews: BookReview[] = [
    {
      id: 'rev-001',
      bookId: 'bk-001',
      memberId: 'mem-002',
      memberName: 'Nadia Putri',
      rating: 5,
      comment: 'Referensi sejarah intelektual Nusantara yang sangat jernih dan tertata rapi.',
      createdAt: daysFromNow(-12),
    },
    {
      id: 'rev-002',
      bookId: 'bk-003',
      memberId: 'mem-001',
      memberName: 'Budi Santoso',
      rating: 5,
      comment: 'Penjelasan graf terdistribusi mudah dipahami dan langsung relevan dengan praktik.',
      createdAt: daysFromNow(-8),
    },
    {
      id: 'rev-003',
      bookId: 'bk-004',
      memberId: 'mem-003',
      memberName: 'Raka Pratama',
      rating: 4,
      comment: 'Prosa yang tenang dan puitis, cocok dibaca pada akhir pekan.',
      createdAt: daysFromNow(-2),
    },
    {
      id: 'rev-004',
      bookId: 'bk-006',
      memberId: 'mem-001',
      memberName: 'Budi Santoso',
      rating: 5,
      comment: 'Ilustrasi mekanika orbitnya membantu memahami peta langit selatan.',
      createdAt: daysFromNow(-1),
    },
  ];

  const reservations: Reservation[] = [];

  const activities: ActivityEvent[] = [
    {
      id: 'act-001',
      type: 'loan:returned',
      actorName: 'Budi Santoso',
      actorRole: 'member',
      summary: 'Pengembalian tepat waktu: Sistem Basis Data Modern & Arsitektur Event',
      detail: 'Kode PJM-2611-012 · Denda Rp 0',
      timestamp: daysFromNow(0),
    },
    {
      id: 'act-002',
      type: 'loan:created',
      actorName: 'Dewi Anggraini',
      actorRole: 'member',
      summary: 'Peminjaman baru: Struktur Data & Algoritma Terdistribusi',
      detail: 'Kode PJM-2611-008 · Durasi 7 hari',
      timestamp: daysFromNow(-1),
    },
    {
      id: 'act-003',
      type: 'loan:created',
      actorName: 'Nadia Putri',
      actorRole: 'member',
      summary: 'Peminjaman baru: Arsitektur Tropis Kontemporer',
      detail: 'Kode PJM-2611-003 · Durasi 7 hari',
      timestamp: daysFromNow(-2),
    },
    {
      id: 'act-004',
      type: 'loan:extended',
      actorName: 'Nadia Putri',
      actorRole: 'member',
      summary: 'Perpanjangan masa pinjam (+7 hari): Sistem Basis Data Modern & Arsitektur Event',
      detail: 'Kode PJM-2611-006',
      timestamp: daysFromNow(-2),
    },
  ];

  const reportSchedule: ReportSchedule = {
    enabled: true,
    frequency: 'daily',
    runHour: 17,
    lastRunAt: daysFromNow(-1),
    nextRunAt: daysFromNow(1),
  };

  const initialState: DatabaseState = {
    books,
    members,
    loans,
    reservations,
    reviews,
    activities,
    reports: [],
    reportSchedule,
    adminCredential: null,
  };

  reconcileLoansAndBooks(initialState);
  initialState.reports.push(
    buildReportSnapshot(initialState, 'Harian', 'auto', 'Penjadwal Otomatis Sistem')
  );

  return initialState;
}

function normalizeLoadedState(rawState: Partial<DatabaseState>): DatabaseState {
  const seed = createInitialSeedState();
  const rawAdmin = rawState.adminCredential;
  const adminCredential: AdminCredential | null =
    rawAdmin &&
    typeof rawAdmin.username === 'string' &&
    typeof rawAdmin.passwordHash === 'string' &&
    typeof rawAdmin.salt === 'string'
      ? rawAdmin
      : null;
  const state: DatabaseState = {
    books: Array.isArray(rawState.books) ? rawState.books : seed.books,
    members: Array.isArray(rawState.members)
      ? rawState.members.map((m) => ({
          ...m,
          bookmarkIds: Array.isArray(m.bookmarkIds) ? m.bookmarkIds : [],
        }))
      : seed.members,
    loans: Array.isArray(rawState.loans)
      ? rawState.loans.map((l) => ({
          ...l,
          finePaid: Boolean(l.finePaid),
          finePaymentStatus: l.finePaid
            ? 'verified'
            : l.finePaymentStatus ?? 'unpaid',
          finePaymentProof: l.finePaymentProof ?? null,
        }))
      : seed.loans,
    reservations: Array.isArray(rawState.reservations) ? rawState.reservations : [],
    reviews: Array.isArray(rawState.reviews) ? rawState.reviews : seed.reviews,
    activities: Array.isArray(rawState.activities) ? rawState.activities : seed.activities,
    reports: Array.isArray(rawState.reports) ? rawState.reports : seed.reports,
    reportSchedule: rawState.reportSchedule ?? seed.reportSchedule,
    adminCredential,
  };
  reconcileLoansAndBooks(state);
  return state;
}

function loadDatabase(): DatabaseState {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
      const seeded = createInitialSeedState();
      saveDatabase(seeded);
      return seeded;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    return normalizeLoadedState(parsed);
  } catch {
    return createInitialSeedState();
  }
}

function saveDatabase(state: DatabaseState): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch {
    // Fallback gracefully if filesystem is read-only
  }
}

function signSessionToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesi autentikasi diperlukan.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Token sesi tidak valid atau kedaluwarsa.' });
    return;
  }
  req.session = payload;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.session || req.session.role !== 'admin') {
    res.status(403).json({ error: 'Akses khusus Administrator Pustakawan.' });
    return;
  }
  next();
}

function computeNextRunAt(frequency: ReportFrequency, runHour: number): string {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(runHour);
  if (next.getTime() <= Date.now()) {
    if (frequency === 'daily') next.setDate(next.getDate() + 1);
    else if (frequency === 'weekly') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString();
}

function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function formatAdminDisplayName(username: string): string {
  return (
    username
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Administrator'
  );
}

function hashAdminPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = crypto.createHmac('sha256', SESSION_SECRET).update(a, 'utf-8').digest();
  const digestB = crypto.createHmac('sha256', SESSION_SECRET).update(b, 'utf-8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function getAdminAuthConfig(state: DatabaseState): {
  configured: boolean;
  source: 'env' | 'claimed' | 'unconfigured';
  envUsername?: string;
  envPassword?: string;
  claimed?: AdminCredential;
} {
  const envUsername = (process.env.ADMIN_USERNAME || '').trim();
  const envPassword = process.env.ADMIN_PASSWORD || '';
  if (envUsername && envPassword) {
    return { configured: true, source: 'env', envUsername, envPassword };
  }
  if (
    state.adminCredential?.username &&
    state.adminCredential?.passwordHash &&
    state.adminCredential?.salt
  ) {
    return { configured: true, source: 'claimed', claimed: state.adminCredential };
  }
  return { configured: false, source: 'unconfigured' };
}

function issueAdminSessionResponse(username: string) {
  const payload: SessionPayload = {
    role: 'admin',
    userId: 'adm-001',
    name: formatAdminDisplayName(username),
    email: 'admin@kazyfilibrary.id',
    code: 'ADMIN-KAZYFI',
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };
  const token = signSessionToken(payload);
  return {
    token,
    role: payload.role,
    userId: payload.userId,
    name: payload.name,
    email: payload.email,
    code: payload.code,
  };
}

export function createApiApp(options?: { enableBackgroundScheduler?: boolean }) {
  const db = loadDatabase();
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const sseClients = new Set<Response>();

  function broadcastEvent(eventName: string, payload: unknown): void {
    const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      client.write(data);
    }
  }

  function recordActivity(
    type: ActivityEvent['type'],
    actorName: string,
    actorRole: ActivityEvent['actorRole'],
    summary: string,
    detail: string
  ): ActivityEvent {
    const event: ActivityEvent = {
      id: `act-${crypto.randomUUID().slice(0, 8)}`,
      type,
      actorName,
      actorRole,
      summary,
      detail,
      timestamp: new Date().toISOString(),
    };
    db.activities.unshift(event);
    if (db.activities.length > 60) {
      db.activities = db.activities.slice(0, 60);
    }
    return event;
  }

  function buildSyncPayload(eventName: string, activity?: ActivityEvent) {
    const stats = computeStatistics(db);
    saveDatabase(db);
    return {
      eventName,
      activity,
      books: db.books,
      members: db.members,
      loans: db.loans,
      reservations: db.reservations,
      reviews: db.reviews,
      activities: db.activities,
      reports: db.reports,
      reportSchedule: db.reportSchedule,
      stats,
      connectedClients: Math.max(1, sseClients.size),
    };
  }

  function emitFullSync(eventName: string, activity?: ActivityEvent) {
    const payload = buildSyncPayload(eventName, activity);
    broadcastEvent('sync', payload);
    return payload;
  }

  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);
    broadcastEvent('presence', { connectedClients: sseClients.size });

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
      broadcastEvent('presence', { connectedClients: Math.max(1, sseClients.size) });
    });
  });

  app.get('/api/auth/admin-status', (_req: Request, res: Response) => {
    const cfg = getAdminAuthConfig(db);
    res.json({
      configured: cfg.configured,
      source: cfg.source,
    });
  });

  app.post('/api/auth/admin-setup', (req: Request, res: Response) => {
    const cfg = getAdminAuthConfig(db);
    if (cfg.source !== 'unconfigured') {
      res.status(409).json({
        error: 'Akun admin sudah dikonfigurasi. Silakan masuk melalui menu Login Admin.',
      });
      return;
    }

    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (rawUsername.length < 3 || rawUsername.length > 64) {
      res.status(400).json({ error: 'Username admin harus terdiri dari 3 hingga 64 karakter.' });
      return;
    }
    if (rawPassword.length < 6 || rawPassword.length > 128) {
      res.status(400).json({ error: 'Password admin harus terdiri dari 6 hingga 128 karakter.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashAdminPassword(rawPassword, salt);
    db.adminCredential = {
      username: rawUsername,
      passwordHash,
      salt,
      updatedAt: new Date().toISOString(),
    };
    saveDatabase(db);

    res.status(201).json(issueAdminSessionResponse(rawUsername));
  });

  app.post('/api/auth/admin-login', (req: Request, res: Response) => {
    const cfg = getAdminAuthConfig(db);
    if (!cfg.configured) {
      res.status(409).json({
        error: 'Akun admin belum diaktivasi. Lakukan aktivasi akun admin terlebih dahulu.',
      });
      return;
    }

    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!rawUsername || !rawPassword) {
      res.status(400).json({ error: 'Username dan password admin wajib diisi.' });
      return;
    }

    let valid = false;
    let displayUsername = rawUsername;

    if (cfg.source === 'env' && cfg.envUsername && cfg.envPassword) {
      const userOk = timingSafeStringEqual(
        normalizeUsername(rawUsername),
        normalizeUsername(cfg.envUsername)
      );
      const passOk = timingSafeStringEqual(rawPassword, cfg.envPassword);
      valid = userOk && passOk;
      displayUsername = cfg.envUsername;
    } else if (cfg.source === 'claimed' && cfg.claimed) {
      const userOk = timingSafeStringEqual(
        normalizeUsername(rawUsername),
        normalizeUsername(cfg.claimed.username)
      );
      const computedBuf = crypto.scryptSync(rawPassword, cfg.claimed.salt, 64);
      const storedBuf = Buffer.from(cfg.claimed.passwordHash, 'hex');
      const passOk =
        computedBuf.length === storedBuf.length && crypto.timingSafeEqual(computedBuf, storedBuf);
      valid = userOk && passOk;
      displayUsername = cfg.claimed.username;
    }

    if (!valid) {
      res.status(401).json({ error: 'Username atau password admin salah.' });
      return;
    }

    res.json(issueAdminSessionResponse(displayUsername));
  });

  app.post('/api/auth/session', (req: Request, res: Response) => {
    const { role, memberId } = req.body as { role?: UserRole; memberId?: string };

    if (role === 'admin') {
      res.status(403).json({
        error: 'Akses admin memerlukan autentikasi melalui menu Login Admin.',
      });
      return;
    }

    const targetMember =
      db.members.find((m) => m.id === memberId) ??
      db.members.find((m) => m.status === 'active') ??
      db.members[0];

    if (!targetMember) {
      res.status(404).json({ error: 'Anggota tidak ditemukan.' });
      return;
    }

    const payload: SessionPayload = {
      role: 'member',
      userId: targetMember.id,
      name: targetMember.name,
      email: targetMember.email,
      code: targetMember.memberCode,
      exp: Date.now() + 1000 * 60 * 60 * 12,
    };
    const token = signSessionToken(payload);
    res.json({
      token,
      role: payload.role,
      userId: payload.userId,
      name: payload.name,
      email: payload.email,
      code: payload.code,
    });
  });

  app.get('/api/bootstrap', (_req: Request, res: Response) => {
    const stats = computeStatistics(db);
    res.json({
      books: db.books,
      members: db.members,
      loans: db.loans,
      reservations: db.reservations,
      reviews: db.reviews,
      activities: db.activities,
      reports: db.reports,
      reportSchedule: db.reportSchedule,
      stats,
      connectedClients: Math.max(1, sseClients.size),
    });
  });

  app.post('/api/books', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const title = sanitizeText(req.body.title, 140);
    const author = sanitizeText(req.body.author, 100);
    const publisher = sanitizeText(req.body.publisher, 100) || 'Penerbit Nasional';
    const isbn = sanitizeText(req.body.isbn, 32);
    const shelfCode = sanitizeText(req.body.shelfCode, 24) || 'RAK-UMUM';
    const synopsis =
      sanitizeText(req.body.synopsis, 600) ||
      'Koleksi pustaka terkurasi yang tersedia untuk peminjaman anggota Kazyfi Library.';
    const sampleExcerpt =
      sanitizeText(req.body.sampleExcerpt, 800) ||
      `Cuplikan Pembuka — ${title}: ${synopsis}`;
    const rawBarcode = sanitizeText(req.body.barcodeCode, 48).replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
    const barcodeCode = rawBarcode || isbn.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const category = VALID_CATEGORIES.includes(req.body.category)
      ? (req.body.category as BookCategory)
      : 'Teknologi & Data';
    const yearNum = Number(req.body.year);
    const year = Number.isFinite(yearNum) && yearNum >= 1900 && yearNum <= 2030 ? Math.round(yearNum) : 2025;
    const copiesNum = Number(req.body.totalCopies);
    const totalCopies =
      Number.isFinite(copiesNum) && copiesNum >= 1 && copiesNum <= 100 ? Math.round(copiesNum) : 1;

    if (!title || !author || !isbn) {
      res.status(400).json({ error: 'Judul, penulis, dan ISBN wajib diisi.' });
      return;
    }

    const coverByCategory: Record<BookCategory, string> = {
      'Filsafat & Sejarah': '/src/assets/images/cover_filsafat_nusantara_1795659500953.jpg',
      'Arsitektur & Desain': '/src/assets/images/cover_arsitektur_tropis_1795659501240.jpg',
      'Teknologi & Data': '/src/assets/images/cover_algoritma_data_1795659501461.jpg',
      'Sastra & Fiksi': '/src/assets/images/cover_sastra_senja_1795659501618.jpg',
      'Ekonomi & Bisnis': '/src/assets/images/cover_ekonomi_hijau_1795659501820.jpg',
      'Sains & Astronomi': '/src/assets/images/cover_astronomi_kosmos_1795659502173.jpg',
    };

    const newBook: Book = {
      id: `bk-${crypto.randomUUID().slice(0, 8)}`,
      isbn,
      title,
      author,
      publisher,
      year,
      category,
      shelfCode,
      totalCopies,
      availableCopies: totalCopies,
      coverUrl: coverByCategory[category],
      synopsis,
      sampleExcerpt,
      barcodeCode,
      borrowCount: 0,
      ratingAvg: 0,
      ratingCount: 0,
      createdAt: new Date().toISOString(),
    };

    db.books.unshift(newBook);
    const activity = recordActivity(
      'book:created',
      req.session!.name,
      'admin',
      `Menambahkan koleksi baru: ${newBook.title}`,
      `${newBook.totalCopies} eksemplar · ${newBook.category}`
    );
    const sync = emitFullSync('book:created', activity);
    res.status(201).json({ book: newBook, sync });
  });

  app.put('/api/books/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const book = db.books.find((b) => b.id === req.params.id);
    if (!book) {
      res.status(404).json({ error: 'Buku tidak ditemukan.' });
      return;
    }

    const activeLoansCount = db.loans.filter(
      (l) => l.bookId === book.id && l.status !== 'returned'
    ).length;

    const title = sanitizeText(req.body.title, 140) || book.title;
    const author = sanitizeText(req.body.author, 100) || book.author;
    const publisher = sanitizeText(req.body.publisher, 100) || book.publisher;
    const isbn = sanitizeText(req.body.isbn, 32) || book.isbn;
    const shelfCode = sanitizeText(req.body.shelfCode, 24) || book.shelfCode;
    const synopsis = sanitizeText(req.body.synopsis, 600) || book.synopsis;
    const sampleExcerpt = sanitizeText(req.body.sampleExcerpt, 800) || book.sampleExcerpt;
    const rawBarcode =
      typeof req.body.barcodeCode === 'string'
        ? sanitizeText(req.body.barcodeCode, 48).replace(/[^a-zA-Z0-9-]/g, '').toUpperCase()
        : undefined;
    const category = VALID_CATEGORIES.includes(req.body.category)
      ? (req.body.category as BookCategory)
      : book.category;
    const yearNum = Number(req.body.year);
    const year = Number.isFinite(yearNum) && yearNum >= 1900 && yearNum <= 2030 ? Math.round(yearNum) : book.year;

    const copiesNum = Number(req.body.totalCopies);
    const requestedCopies =
      Number.isFinite(copiesNum) && copiesNum >= 1 && copiesNum <= 100
        ? Math.round(copiesNum)
        : book.totalCopies;

    if (requestedCopies < activeLoansCount) {
      res.status(400).json({
        error: `Jumlah total salinan tidak boleh kurang dari jumlah yang sedang dipinjam (${activeLoansCount}).`,
      });
      return;
    }

    book.title = title;
    book.author = author;
    book.publisher = publisher;
    book.isbn = isbn;
    book.shelfCode = shelfCode;
    book.synopsis = synopsis;
    book.sampleExcerpt = sampleExcerpt;
    if (rawBarcode !== undefined) {
      book.barcodeCode = rawBarcode || isbn.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    }
    book.category = category;
    book.year = year;
    book.totalCopies = requestedCopies;
    book.availableCopies = requestedCopies - activeLoansCount;

    const activity = recordActivity(
      'book:updated',
      req.session!.name,
      'admin',
      `Memperbarui data koleksi: ${book.title}`,
      `Total ${book.totalCopies} salinan · Tersedia ${book.availableCopies}`
    );
    const sync = emitFullSync('book:updated', activity);
    res.json({ book, sync });
  });

  app.delete('/api/books/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const idx = db.books.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Buku tidak ditemukan.' });
      return;
    }

    const book = db.books[idx];
    const hasActiveLoan = db.loans.some(
      (l) => l.bookId === book.id && l.status !== 'returned'
    );
    if (hasActiveLoan) {
      res.status(400).json({
        error: 'Buku tidak dapat dihapus karena masih memiliki peminjaman aktif.',
      });
      return;
    }

    db.books.splice(idx, 1);
    const activity = recordActivity(
      'book:deleted',
      req.session!.name,
      'admin',
      `Menghapus koleksi: ${book.title}`,
      `ISBN ${book.isbn}`
    );
    const sync = emitFullSync('book:deleted', activity);
    res.json({ deletedId: book.id, sync });
  });

  // Member Reviews
  app.post('/api/books/:id/reviews', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const book = db.books.find((b) => b.id === req.params.id);
    if (!book) {
      res.status(404).json({ error: 'Buku tidak ditemukan.' });
      return;
    }
    const ratingNum = Number(req.body.rating);
    const rating = Number.isFinite(ratingNum) ? Math.min(5, Math.max(1, Math.round(ratingNum))) : 5;
    const comment = sanitizeText(req.body.comment, 300);

    if (!comment || comment.length < 4) {
      res.status(400).json({ error: 'Ulasan minimal 4 karakter.' });
      return;
    }

    const review: BookReview = {
      id: `rev-${crypto.randomUUID().slice(0, 8)}`,
      bookId: book.id,
      memberId: req.session!.userId,
      memberName: req.session!.name,
      rating,
      comment,
      createdAt: new Date().toISOString(),
    };
    db.reviews.unshift(review);

    const activity = recordActivity(
      'review:created',
      req.session!.name,
      req.session!.role,
      `Memberi ulasan (${rating}/5): ${book.title}`,
      comment.slice(0, 80)
    );
    const sync = emitFullSync('review:created', activity);
    res.status(201).json({ review, sync });
  });

  // Member Bookmarks
  app.post('/api/members/:id/bookmarks', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const memberId = req.params.id;
    if (req.session!.role !== 'admin' && req.session!.userId !== memberId) {
      res.status(403).json({ error: 'Akses ditolak.' });
      return;
    }
    const member = db.members.find((m) => m.id === memberId);
    if (!member) {
      res.status(404).json({ error: 'Anggota tidak ditemukan.' });
      return;
    }
    const bookId = sanitizeText(req.body.bookId, 64);
    if (!db.books.some((b) => b.id === bookId)) {
      res.status(404).json({ error: 'Buku tidak ditemukan.' });
      return;
    }

    const list = member.bookmarkIds ?? [];
    const exists = list.includes(bookId);
    member.bookmarkIds = exists ? list.filter((id) => id !== bookId) : [bookId, ...list];

    const sync = emitFullSync('member:bookmark-updated');
    res.json({ bookmarkIds: member.bookmarkIds, saved: !exists, sync });
  });

  // Member Registration & Status Management (Admin)
  app.post('/api/members', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const name = sanitizeText(req.body.name, 80);
    const email = sanitizeText(req.body.email, 100).toLowerCase();
    const department = sanitizeText(req.body.department, 80) || 'Umum';
    const customCode = sanitizeText(req.body.memberCode, 32)
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toUpperCase();
    const status = req.body.status === 'suspended' ? 'suspended' : 'active';

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Nama lengkap dan format email anggota yang valid wajib diisi.' });
      return;
    }

    if (db.members.some((m) => m.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email anggota sudah terdaftar.' });
      return;
    }

    let memberCode = customCode;
    if (!memberCode) {
      let maxNum = db.members.length;
      for (const m of db.members) {
        const match = m.memberCode.match(/(\d+)$/);
        if (match) {
          const parsed = Number(match[1]);
          if (Number.isFinite(parsed) && parsed > maxNum) maxNum = parsed;
        }
      }
      memberCode = `AGT-2026-${String(maxNum + 1).padStart(3, '0')}`;
    } else if (db.members.some((m) => m.memberCode.toUpperCase() === memberCode)) {
      res.status(409).json({ error: `Kode anggota ${memberCode} sudah digunakan.` });
      return;
    }

    const newMember: Member = {
      id: `mem-${crypto.randomUUID().slice(0, 8)}`,
      memberCode,
      name,
      email,
      department,
      status,
      bookmarkIds: [],
      joinedAt: new Date().toISOString(),
    };

    db.members.unshift(newMember);
    const activity = recordActivity(
      'member:created',
      req.session!.name,
      'admin',
      `Mendaftarkan anggota baru: ${newMember.name}`,
      `${newMember.memberCode} · ${newMember.department}`
    );
    const sync = emitFullSync('member:created', activity);
    res.status(201).json({ member: newMember, sync });
  });

  app.put('/api/members/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const member = db.members.find((m) => m.id === req.params.id);
    if (!member) {
      res.status(404).json({ error: 'Anggota tidak ditemukan.' });
      return;
    }

    const name = sanitizeText(req.body.name, 80) || member.name;
    const email = (sanitizeText(req.body.email, 100) || member.email).toLowerCase();
    const department = sanitizeText(req.body.department, 80) || member.department;
    const status = req.body.status === 'suspended' ? 'suspended' : 'active';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Format email anggota tidak valid.' });
      return;
    }

    if (db.members.some((m) => m.id !== member.id && m.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email sudah digunakan oleh anggota lain.' });
      return;
    }

    member.name = name;
    member.email = email;
    member.department = department;
    member.status = status;

    const activity = recordActivity(
      'member:updated',
      req.session!.name,
      'admin',
      `Memperbarui data anggota: ${member.name}`,
      `${member.memberCode} · ${member.department}`
    );
    const sync = emitFullSync('member:updated', activity);
    res.json({ member, sync });
  });

  app.delete('/api/members/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const idx = db.members.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Anggota tidak ditemukan.' });
      return;
    }

    const member = db.members[idx];
    const hasActiveLoan = db.loans.some(
      (l) => l.memberId === member.id && l.status !== 'returned'
    );
    if (hasActiveLoan) {
      res.status(400).json({
        error: 'Anggota tidak dapat dihapus karena masih memiliki peminjaman aktif atau tertunggak.',
      });
      return;
    }

    db.members.splice(idx, 1);
    const activity = recordActivity(
      'member:deleted',
      req.session!.name,
      'admin',
      `Menghapus anggota: ${member.name}`,
      `${member.memberCode} · ${member.department}`
    );
    const sync = emitFullSync('member:deleted', activity);
    res.json({ deletedId: member.id, sync });
  });

  app.patch('/api/members/:id/status', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const member = db.members.find((m) => m.id === req.params.id);
    if (!member) {
      res.status(404).json({ error: 'Anggota tidak ditemukan.' });
      return;
    }
    const nextStatus = req.body.status === 'suspended' ? 'suspended' : 'active';
    member.status = nextStatus;

    const activity = recordActivity(
      'member:status',
      req.session!.name,
      'admin',
      `Mengubah status ${member.name}: ${nextStatus === 'active' ? 'Aktif' : 'Ditangguhkan'}`,
      member.memberCode
    );
    const sync = emitFullSync('member:status', activity);
    res.json({ member, sync });
  });

  // Reservations (Waitlist Queue)
  app.post('/api/reservations', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { bookId, memberId } = req.body as { bookId?: string; memberId?: string };
    const targetMemberId = req.session!.role === 'admin' && memberId ? memberId : req.session!.userId;
    const member = db.members.find((m) => m.id === targetMemberId);
    if (!member) {
      res.status(404).json({ error: 'Data anggota tidak ditemukan.' });
      return;
    }
    if (member.status !== 'active') {
      res.status(403).json({ error: 'Keanggotaan sedang ditangguhkan.' });
      return;
    }

    const book = db.books.find((b) => b.id === bookId);
    if (!book) {
      res.status(404).json({ error: 'Buku tidak ditemukan.' });
      return;
    }

    reconcileLoansAndBooks(db);
    if (book.availableCopies > 0) {
      res.status(400).json({ error: 'Buku masih tersedia, Anda dapat meminjam langsung.' });
      return;
    }

    const duplicate = db.reservations.some(
      (r) =>
        r.bookId === book.id &&
        r.memberId === member.id &&
        (r.status === 'waiting' || r.status === 'ready')
    );
    if (duplicate) {
      res.status(400).json({ error: 'Anda sudah berada dalam antrean reservasi buku ini.' });
      return;
    }

    const resNum = String(db.reservations.length + 1).padStart(3, '0');
    const reservation: Reservation = {
      id: `res-${crypto.randomUUID().slice(0, 8)}`,
      reservationCode: `RSV-2611-${resNum}`,
      bookId: book.id,
      bookTitle: book.title,
      memberId: member.id,
      memberName: member.name,
      memberCode: member.memberCode,
      status: 'waiting',
      createdAt: new Date().toISOString(),
      readyAt: null,
    };

    db.reservations.push(reservation);
    const activity = recordActivity(
      'reservation:created',
      member.name,
      req.session!.role,
      `Masuk antrean reservasi: ${book.title}`,
      `Kode ${reservation.reservationCode}`
    );
    const sync = emitFullSync('reservation:created', activity);
    res.status(201).json({ reservation, sync });
  });

  app.delete('/api/reservations/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const reservation = db.reservations.find((r) => r.id === req.params.id);
    if (!reservation) {
      res.status(404).json({ error: 'Reservasi tidak ditemukan.' });
      return;
    }
    if (req.session!.role !== 'admin' && reservation.memberId !== req.session!.userId) {
      res.status(403).json({ error: 'Tidak memiliki izin membatalkan reservasi ini.' });
      return;
    }
    if (reservation.status === 'fulfilled' || reservation.status === 'cancelled') {
      res.status(400).json({ error: 'Reservasi sudah selesai atau dibatalkan.' });
      return;
    }

    reservation.status = 'cancelled';
    const activity = recordActivity(
      'reservation:cancelled',
      req.session!.name,
      req.session!.role,
      `Membatalkan reservasi: ${reservation.bookTitle}`,
      reservation.reservationCode
    );
    const sync = emitFullSync('reservation:cancelled', activity);
    res.json({ reservation, sync });
  });

  // Loans (Borrow / Return / Extend / Settle Fine)
  app.post('/api/loans', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { bookId, memberId, durationDays } = req.body as {
      bookId?: string;
      memberId?: string;
      durationDays?: number;
    };

    const targetMemberId = req.session!.role === 'admin' && memberId ? memberId : req.session!.userId;
    const member = db.members.find((m) => m.id === targetMemberId);
    if (!member) {
      res.status(404).json({ error: 'Data anggota tidak ditemukan.' });
      return;
    }
    if (member.status !== 'active') {
      res.status(403).json({ error: 'Status keanggotaan ditangguhkan.' });
      return;
    }

    const book = db.books.find((b) => b.id === bookId);
    if (!book) {
      res.status(404).json({ error: 'Buku tidak ditemukan dalam katalog.' });
      return;
    }

    reconcileLoansAndBooks(db);
    if (book.availableCopies <= 0) {
      res.status(400).json({ error: 'Stok buku ini sedang habis dipinjam. Gunakan antrean reservasi.' });
      return;
    }

    const memberActiveLoans = db.loans.filter(
      (l) => l.memberId === member.id && l.status !== 'returned'
    );
    if (memberActiveLoans.length >= MAX_ACTIVE_LOANS_PER_MEMBER) {
      res.status(400).json({
        error: `Batas maksimal ${MAX_ACTIVE_LOANS_PER_MEMBER} buku aktif per anggota telah tercapai.`,
      });
      return;
    }

    if (memberActiveLoans.some((l) => l.bookId === book.id)) {
      res.status(400).json({ error: 'Anggota sedang meminjam judul buku yang sama.' });
      return;
    }

    const validDays = durationDays === 14 ? 14 : 7;
    const now = new Date();
    const due = new Date(now);
    due.setDate(now.getDate() + validDays);

    const loanNum = String(db.loans.length + 1).padStart(3, '0');
    const newLoan: Loan = {
      id: `ln-${crypto.randomUUID().slice(0, 8)}`,
      loanCode: `PJM-2611-${loanNum}`,
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author,
      bookIsbn: book.isbn,
      memberId: member.id,
      memberName: member.name,
      memberCode: member.memberCode,
      borrowedAt: now.toISOString(),
      dueAt: due.toISOString(),
      returnedAt: null,
      extendedCount: 0,
      fineAmount: 0,
      finePaid: false,
      status: 'active',
    };

    // Fulfill any ready/waiting reservation for this member & book
    const matchingReservation = db.reservations.find(
      (r) =>
        r.bookId === book.id &&
        r.memberId === member.id &&
        (r.status === 'ready' || r.status === 'waiting')
    );
    if (matchingReservation) {
      matchingReservation.status = 'fulfilled';
    }

    book.borrowCount += 1;
    db.loans.unshift(newLoan);
    reconcileLoansAndBooks(db);

    const activity = recordActivity(
      'loan:created',
      req.session!.role === 'admin' ? `${req.session!.name} (untuk ${member.name})` : member.name,
      req.session!.role,
      `Peminjaman baru: ${book.title}`,
      `Kode ${newLoan.loanCode} · Durasi ${validDays} hari`
    );
    const sync = emitFullSync('loan:created', activity);
    res.status(201).json({ loan: newLoan, sync });
  });

  app.post('/api/loans/:id/return', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const loan = db.loans.find((l) => l.id === req.params.id);
    if (!loan) {
      res.status(404).json({ error: 'Transaksi peminjaman tidak ditemukan.' });
      return;
    }

    if (req.session!.role !== 'admin' && loan.memberId !== req.session!.userId) {
      res.status(403).json({ error: 'Anda tidak memiliki izin untuk memproses pinjaman ini.' });
      return;
    }

    if (loan.status === 'returned') {
      res.status(400).json({ error: 'Buku ini sudah dikembalikan sebelumnya.' });
      return;
    }

    const now = new Date();
    const lateDays = calculateDaysLate(loan.dueAt, now);
    loan.returnedAt = now.toISOString();
    loan.fineAmount = lateDays * FINE_PER_DAY;
    loan.status = 'returned';
    reconcileLoansAndBooks(db);

    const fineText =
      loan.fineAmount > 0 ? `Denda Rp ${loan.fineAmount.toLocaleString('id-ID')}` : 'Tepat waktu';
    const activity = recordActivity(
      'loan:returned',
      req.session!.name,
      req.session!.role,
      `Pengembalian buku: ${loan.bookTitle}`,
      `Kode ${loan.loanCode} · ${fineText}`
    );

    // Promote first waiting reservation in queue automatically
    const nextWaiting = db.reservations.find(
      (r) => r.bookId === loan.bookId && r.status === 'waiting'
    );
    if (nextWaiting) {
      nextWaiting.status = 'ready';
      nextWaiting.readyAt = now.toISOString();
      recordActivity(
        'reservation:ready',
        'Sistem Antrean',
        'system',
        `Buku tersedia untuk antrean: ${nextWaiting.bookTitle}`,
        `${nextWaiting.memberName} (${nextWaiting.reservationCode}) dapat meminjam sekarang`
      );
    }

    const sync = emitFullSync('loan:returned', activity);
    res.json({ loan, sync });
  });

  app.post('/api/loans/:id/extend', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const loan = db.loans.find((l) => l.id === req.params.id);
    if (!loan) {
      res.status(404).json({ error: 'Transaksi peminjaman tidak ditemukan.' });
      return;
    }

    if (req.session!.role !== 'admin' && loan.memberId !== req.session!.userId) {
      res.status(403).json({ error: 'Anda tidak memiliki izin untuk memperpanjang pinjaman ini.' });
      return;
    }

    reconcileLoansAndBooks(db);
    if (loan.status === 'returned') {
      res.status(400).json({ error: 'Buku sudah dikembalikan.' });
      return;
    }
    if (loan.status === 'overdue') {
      res.status(400).json({ error: 'Pinjaman yang terlambat tidak dapat diperpanjang otomatis.' });
      return;
    }
    if (loan.extendedCount >= 1) {
      res.status(400).json({ error: 'Batas perpanjangan maksimal 1 kali telah digunakan.' });
      return;
    }

    const due = new Date(loan.dueAt);
    due.setDate(due.getDate() + 7);
    loan.dueAt = due.toISOString();
    loan.extendedCount += 1;

    const activity = recordActivity(
      'loan:extended',
      req.session!.name,
      req.session!.role,
      `Perpanjangan masa pinjam (+7 hari): ${loan.bookTitle}`,
      `Kode ${loan.loanCode}`
    );
    const sync = emitFullSync('loan:extended', activity);
    res.json({ loan, sync });
  });

  app.post('/api/loans/:id/submit-fine-proof', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const loan = db.loans.find((l) => l.id === req.params.id);
    if (!loan) {
      res.status(404).json({ error: 'Transaksi peminjaman tidak ditemukan.' });
      return;
    }
    if (req.session!.role !== 'admin' && loan.memberId !== req.session!.userId) {
      res.status(403).json({ error: 'Anda tidak memiliki izin untuk membayar denda pinjaman ini.' });
      return;
    }

    reconcileLoansAndBooks(db);
    if (loan.fineAmount <= 0 || loan.finePaid) {
      res.status(400).json({ error: 'Tidak ada tagihan denda yang perlu dibayar pada transaksi ini.' });
      return;
    }

    const rawMethod = req.body?.method;
    if (rawMethod !== 'bank_transfer' && rawMethod !== 'qris') {
      res.status(400).json({ error: 'Metode pembayaran harus Transfer Rekening atau QRIS.' });
      return;
    }
    const method: FinePaymentMethod = rawMethod;
    const channelLabel = sanitizeText(req.body?.channelLabel, 80);
    const referenceCode = sanitizeText(req.body?.referenceCode, 64);
    const payerName = sanitizeText(req.body?.payerName, 80) || req.session!.name;
    const notes = sanitizeText(req.body?.notes, 200);
    const proofFileName = sanitizeText(req.body?.proofFileName, 80) || 'bukti-pembayaran.jpg';
    const rawProofImage = typeof req.body?.proofImageDataUrl === 'string' ? req.body.proofImageDataUrl.trim() : '';

    if (!channelLabel || referenceCode.length < 3) {
      res.status(400).json({
        error: 'Tujuan pembayaran dan nomor referensi transaksi (minimal 3 karakter) wajib diisi.',
      });
      return;
    }

    const validImagePattern = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;
    if (!validImagePattern.test(rawProofImage) || rawProofImage.length > 650_000) {
      res.status(400).json({
        error: 'Bukti pembayaran harus berupa gambar PNG, JPG, atau WEBP dengan ukuran maksimal ~450KB.',
      });
      return;
    }

    const proof: FinePaymentProof = {
      method,
      channelLabel,
      referenceCode,
      proofImageDataUrl: rawProofImage,
      proofFileName,
      payerName,
      notes: notes || undefined,
      submittedAt: new Date().toISOString(),
      verifiedAt: null,
      verifiedBy: null,
      rejectionReason: null,
    };

    loan.finePaymentStatus = 'pending_verification';
    loan.finePaymentProof = proof;

    const methodText = method === 'qris' ? 'QRIS' : 'Transfer Rekening';
    const activity = recordActivity(
      'fine:submitted',
      req.session!.name,
      req.session!.role,
      `Mengunggah bukti bayar denda (${methodText}): Rp ${loan.fineAmount.toLocaleString('id-ID')}`,
      `Kode ${loan.loanCode} · Ref ${referenceCode}`
    );
    const sync = emitFullSync('fine:submitted', activity);
    res.json({ loan, sync });
  });

  app.post('/api/loans/:id/pay-fine', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const loan = db.loans.find((l) => l.id === req.params.id);
    if (!loan) {
      res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
      return;
    }
    if (loan.fineAmount <= 0 || loan.finePaid) {
      res.status(400).json({ error: 'Tidak ada denda belum lunas pada transaksi ini.' });
      return;
    }
    loan.finePaid = true;
    loan.finePaymentStatus = 'verified';
    if (loan.finePaymentProof) {
      loan.finePaymentProof.verifiedAt = new Date().toISOString();
      loan.finePaymentProof.verifiedBy = req.session!.name;
      loan.finePaymentProof.rejectionReason = null;
    }
    const activity = recordActivity(
      'fine:paid',
      req.session!.name,
      'admin',
      `Pelunasan denda (${loan.memberName}): Rp ${loan.fineAmount.toLocaleString('id-ID')}`,
      `Kode ${loan.loanCode} · ${loan.bookTitle}`
    );
    const sync = emitFullSync('fine:paid', activity);
    res.json({ loan, sync });
  });

  app.post('/api/loans/:id/reject-fine-proof', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const loan = db.loans.find((l) => l.id === req.params.id);
    if (!loan) {
      res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
      return;
    }
    if (!loan.finePaymentProof || loan.finePaid) {
      res.status(400).json({ error: 'Tidak ada bukti pembayaran tertunda pada transaksi ini.' });
      return;
    }
    const reason =
      sanitizeText(req.body?.reason, 200) ||
      'Bukti transfer atau nominal tidak sesuai. Silakan unggah ulang bukti yang jelas.';
    loan.finePaid = false;
    loan.finePaymentStatus = 'rejected';
    loan.finePaymentProof.rejectionReason = reason;
    loan.finePaymentProof.verifiedAt = new Date().toISOString();
    loan.finePaymentProof.verifiedBy = req.session!.name;

    const activity = recordActivity(
      'fine:rejected',
      req.session!.name,
      'admin',
      `Menolak bukti bayar denda (${loan.memberName}): ${loan.loanCode}`,
      reason
    );
    const sync = emitFullSync('fine:rejected', activity);
    res.json({ loan, sync });
  });

  app.post('/api/reports/generate', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const allowedKinds: ReportKind[] = [
      'Harian',
      'Mingguan',
      'Bulanan',
      'Audit Keterlambatan',
      'Otomatis',
    ];
    const kind: ReportKind = allowedKinds.includes(req.body.kind) ? req.body.kind : 'Harian';
    const report = buildReportSnapshot(db, kind, 'manual', req.session!.name);
    db.reports.unshift(report);
    if (db.reports.length > 40) {
      db.reports = db.reports.slice(0, 40);
    }

    const activity = recordActivity(
      'report:generated',
      req.session!.name,
      'admin',
      `Membuat ${report.title}`,
      `${report.reportCode} · ${report.metrics.activeLoans} pinjaman aktif`
    );
    const sync = emitFullSync('report:generated', activity);
    res.status(201).json({ report, sync });
  });

  app.put('/api/reports/schedule', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const enabled = Boolean(req.body.enabled);
    const freqList: ReportFrequency[] = ['daily', 'weekly', 'monthly'];
    const frequency: ReportFrequency = freqList.includes(req.body.frequency)
      ? req.body.frequency
      : db.reportSchedule.frequency;
    const hourNum = Number(req.body.runHour);
    const runHour = Number.isFinite(hourNum) && hourNum >= 0 && hourNum <= 23 ? Math.round(hourNum) : 17;

    db.reportSchedule = {
      ...db.reportSchedule,
      enabled,
      frequency,
      runHour,
      nextRunAt: computeNextRunAt(frequency, runHour),
    };

    const freqText = frequency === 'daily' ? 'Harian' : frequency === 'weekly' ? 'Mingguan' : 'Bulanan';
    const activity = recordActivity(
      'report:generated',
      req.session!.name,
      'admin',
      `Memperbarui jadwal pelaporan otomatis (${enabled ? 'Aktif' : 'Nonaktif'})`,
      `Frekuensi ${freqText} · Pukul ${String(runHour).padStart(2, '0')}:00`
    );
    const sync = emitFullSync('report:schedule-updated', activity);
    res.json({ reportSchedule: db.reportSchedule, sync });
  });

  app.get('/api/reports/:id/csv', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const report = db.reports.find((r) => r.id === req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Laporan tidak ditemukan.' });
      return;
    }

    const escapeCsv = (val: string | number) => {
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines: string[] = [
      ['Kode Laporan', report.reportCode].map(escapeCsv).join(','),
      ['Judul', report.title].map(escapeCsv).join(','),
      ['Jenis', report.kind].map(escapeCsv).join(','),
      ['Dibuat Oleh', report.generatedBy].map(escapeCsv).join(','),
      ['Waktu Pembuatan', new Date(report.generatedAt).toLocaleString('id-ID')].map(escapeCsv).join(','),
      '',
      ['Metrik Sirkulasi', 'Nilai'].map(escapeCsv).join(','),
      ['Total Judul Koleksi', report.metrics.totalTitles].map(escapeCsv).join(','),
      ['Total Eksemplar', report.metrics.totalCopies].map(escapeCsv).join(','),
      ['Eksemplar Tersedia', report.metrics.availableCopies].map(escapeCsv).join(','),
      ['Peminjaman Aktif', report.metrics.activeLoans].map(escapeCsv).join(','),
      ['Peminjaman Terlambat', report.metrics.overdueLoans].map(escapeCsv).join(','),
      ['Dipinjam dalam Periode', report.metrics.borrowedInPeriod].map(escapeCsv).join(','),
      ['Dikembalikan dalam Periode', report.metrics.returnedInPeriod].map(escapeCsv).join(','),
      ['Rasio Pengembalian Tepat Waktu (%)', report.metrics.onTimeRate].map(escapeCsv).join(','),
      ['Tingkat Utilisasi Koleksi (%)', report.metrics.utilizationRate].map(escapeCsv).join(','),
      ['Estimasi Total Denda Berjalan (Rp)', report.metrics.totalAccruedFines].map(escapeCsv).join(','),
      '',
      ['Daftar Keterlambatan', 'Judul Buku', 'Anggota', 'Hari Terlambat', 'Estimasi Denda (Rp)']
        .map(escapeCsv)
        .join(','),
      ...report.overdueSnapshot.map((o) =>
        [o.loanCode, o.bookTitle, o.memberName, o.daysLate, o.estimatedFine].map(escapeCsv).join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.reportCode}.csv"`);
    res.send(`\uFEFF${lines.join('\n')}`);
  });

  if (options?.enableBackgroundScheduler !== false && !IS_VERCEL) {
    setInterval(() => {
      if (!db.reportSchedule.enabled) return;
      const nowMs = Date.now();
      const nextRunMs = new Date(db.reportSchedule.nextRunAt).getTime();
      if (nowMs >= nextRunMs) {
        const kindMap: Record<ReportFrequency, ReportKind> = {
          daily: 'Harian',
          weekly: 'Mingguan',
          monthly: 'Bulanan',
        };
        const report = buildReportSnapshot(
          db,
          kindMap[db.reportSchedule.frequency],
          'auto',
          'Penjadwal Otomatis Sistem'
        );
        db.reports.unshift(report);
        db.reportSchedule.lastRunAt = new Date().toISOString();
        db.reportSchedule.nextRunAt = computeNextRunAt(
          db.reportSchedule.frequency,
          db.reportSchedule.runHour
        );
        const activity = recordActivity(
          'report:generated',
          'Sistem Otomatis',
          'system',
          `Pelaporan otomatis selesai: ${report.title}`,
          `${report.reportCode} · Utilisasi ${report.metrics.utilizationRate}%`
        );
        emitFullSync('report:auto-generated', activity);
      }
    }, 60000);
  }

  return app;
}
