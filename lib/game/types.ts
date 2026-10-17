export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export type PublicQuestion = {
  id: string;
  position: 1 | 2 | 3;
  difficulty: Difficulty;
  prompt: string;
  context: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageCredit: string | null;
  withdrawn: boolean;
  correctionNote: string | null;
};

export type PublicDailySet = {
  id: string;
  gameDate: string;
  isSample: boolean;
  questions: PublicQuestion[];
};

export type RevealSource = { title: string; publisher: string; url: string; publishedAt: string | null };

export type Reveal = {
  answerDefinition: string | null;
  explanation: string | null;
  referenceLabel: string | null;
  sources: RevealSource[];
  correctionNote: string | null;
};

/** A stored, server-scored result for one question (official or practice). */
export type QuestionResult = {
  questionId: string;
  position: 1 | 2 | 3;
  mode: "official" | "practice" | "reveal";
  guess: string | null;
  answer: string;
  score: number | null;
  percentageError: string | null;
  voided: boolean;
  originalScore: number | null;
  reveal: Reveal;
};
