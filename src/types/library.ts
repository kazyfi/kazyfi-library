export type UserRole = 'admin' | 'member';

export type BookCategory =
  | 'Filsafat & Sejarah'
  | 'Arsitektur & Desain'
  | 'Teknologi & Data'
  | 'Sastra & Fiksi'
  | 'Ekonomi & Bisnis'
  | 'Sains & Astronomi';

export interface Book {
  id: string;
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  year: number;
  category: BookCategory;
  shelfCode: string;
  totalCopies: number;
  availableCopies: number;
  coverUrl: string;
  synopsis: string;
  borrowCount: number;
  createdAt: string;
}

export interface Member {
  id: string;
  memberCode: string;
  name: string;
  email: string;
  department: string;
  status: 'active' | 'suspended';
  joinedAt: string;
}

export type LoanStatus = 'active' | 'overdue' | 'returned';

export interface Loan {
  id: string;
  loanCode: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookIsbn: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  extendedCount: number;
  fineAmount: number;
  status: LoanStatus;
  notes?: string;
}

export type ActivityType =
  | 'loan:created'
  | 'loan:returned'
  | 'loan:extended'
  | 'book:created'
  | 'book:updated'
  | 'book:deleted'
  | 'member:created'
  | 'report:generated';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  actorName: string;
  actorRole: UserRole | 'system';
  summary: string;
  detail: string;
  timestamp: string;
}

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';
export type ReportKind = 'Harian' | 'Mingguan' | 'Bulanan' | 'Audit Keterlambatan' | 'Otomatis';

export interface ReportSchedule {
  enabled: boolean;
  frequency: ReportFrequency;
  runHour: number;
  lastRunAt: string | null;
  nextRunAt: string;
}

export interface AutomatedReport {
  id: string;
  reportCode: string;
  title: string;
  kind: ReportKind;
  trigger: 'auto' | 'manual';
  generatedBy: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  metrics: {
    totalTitles: number;
    totalCopies: number;
    availableCopies: number;
    activeLoans: number;
    overdueLoans: number;
    returnedInPeriod: number;
    borrowedInPeriod: number;
    onTimeRate: number;
    utilizationRate: number;
    totalAccruedFines: number;
  };
  topBooks: Array<{
    bookId: string;
    title: string;
    author: string;
    borrowCount: number;
  }>;
  overdueSnapshot: Array<{
    loanCode: string;
    bookTitle: string;
    memberName: string;
    daysLate: number;
    estimatedFine: number;
  }>;
}

export interface DailyCirculationPoint {
  date: string;
  label: string;
  borrowed: number;
  returned: number;
}

export interface CategoryDistributionPoint {
  category: string;
  titles: number;
  totalCopies: number;
  borrowedCount: number;
}

export interface LibraryStatistics {
  totalTitles: number;
  totalCopies: number;
  availableCopies: number;
  activeLoansCount: number;
  overdueLoansCount: number;
  returnedLoansCount: number;
  activeMembersCount: number;
  utilizationRate: number;
  onTimeReturnRate: number;
  totalOutstandingFines: number;
  dailyTrend: DailyCirculationPoint[];
  categoryDistribution: CategoryDistributionPoint[];
  topBooks: Array<{
    id: string;
    title: string;
    author: string;
    category: string;
    borrowCount: number;
    availableCopies: number;
    totalCopies: number;
  }>;
}

export interface SessionInfo {
  token: string;
  role: UserRole;
  userId: string;
  name: string;
  email: string;
  code: string;
}

export interface LibraryBootstrapPayload {
  books: Book[];
  members: Member[];
  loans: Loan[];
  activities: ActivityEvent[];
  reports: AutomatedReport[];
  reportSchedule: ReportSchedule;
  stats: LibraryStatistics;
  connectedClients: number;
}
