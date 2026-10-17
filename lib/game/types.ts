export type Difficulty = "easy" | "medium" | "hard";

export type Source = { title: string; publisher: string; url: string; publishedAt: string | null };

export type Correction = {
  oldAnswer: string;
  newAnswer: string;
  reason: string;
  sourceUrl: string;
  correctedAt: string;
};

export type Reveal = {
  answer: string;
  answerDefinition: string;
  referenceDate: string | null;
  referencePeriod: string | null;
  explanation: string;
  sources: Source[];
  corrections: Correction[];
};

export type Attempt = {
  guess: string;
  answerSnapshot: string;
  score: number;
  percentageError: string;
  submittedAt: string;
};

export type AttemptWithReveal = Attempt & { reveal: Reveal; questionId?: string; practice?: boolean };

export type PublicQuestion = {
  id: string;
  position: 1 | 2 | 3;
  difficulty: Difficulty;
  prompt: string;
  context: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageCredit: string | null;
  category: string;
  isSample: boolean;
};

export type GameQuestion = PublicQuestion & { attempt: AttemptWithReveal | null };

export type GameState =
  | { available: false; gameDate: string; today: string }
  | {
      available: true;
      setId: string;
      gameDate: string;
      today: string;
      isToday: boolean;
      questions: GameQuestion[];
    };

export type ArchiveQuestion = PublicQuestion & {
  official: Attempt | null;
  practice: Attempt | null;
  reveal: Reveal | null;
};

export type ArchiveState =
  | { available: false; gameDate: string; today: string }
  | { available: true; setId: string; gameDate: string; today: string; questions: ArchiveQuestion[] };

export type ArchiveListItem = {
  gameDate: string;
  setId: string;
  difficulties: Difficulty[];
  officialAnswered: number;
  officialTotal: number;
  practiceAnswered: number;
};

export type SubmitError =
  | "invalid_guess"
  | "guest_expired"
  | "unauthorized"
  | "suspended"
  | "question_not_found"
  | "set_not_published"
  | "not_current_set"
  | "not_archived"
  | "official_exists"
  | "rate_limited";

export type SubmitResult =
  | {
      ok: true;
      duplicate: boolean;
      attempt: AttemptWithReveal;
      progress?: { answered: number; total: number; completed: boolean; setId: string; gameDate: string };
    }
  | { ok: false; error: SubmitError };

export type LeaderboardRow = {
  rank: number;
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  totalScore: number;
  easyScore?: number;
  mediumScore?: number;
  hardScore: number;
  perfectGuesses: number;
  gamesCompleted?: number;
  completedAt: string;
  participants: number;
};

export type ProfileStats = {
  totalPoints: number;
  gamesCompleted: number;
  averageDailyScore: number | null;
  highestDailyScore: number | null;
  questionsAnswered: number;
  averageQuestionScore: number | null;
  perfectGuesses: number;
  medianPercentageError: number | null;
  averagePercentageError: number | null;
  byDifficulty: Partial<Record<Difficulty, { answered: number; averageScore: number }>>;
  currentStreak: number;
  bestStreak: number;
  recent: { gameDate: string; total: number; easy: number; medium: number; hard: number }[];
};

export type Profile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  isAdmin: boolean;
  isSuspended: boolean;
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
