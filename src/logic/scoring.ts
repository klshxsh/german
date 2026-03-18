export interface SessionSummary {
  totalQuestions: number;
  correctAnswers: number;
  accuracyPercent: number;
  elapsedMs: number;
}

export function calculateSessionSummary(
  totalQuestions: number,
  correctAnswers: number,
  startedAt: string,
  endedAt: string
): SessionSummary {
  const elapsedMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const accuracyPercent =
    totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  return { totalQuestions, correctAnswers, accuracyPercent, elapsedMs };
}

export function calculateSentenceScore(attemptNumber: number, correct: boolean): number {
  if (!correct) return 0;
  if (attemptNumber === 1) return 2;
  if (attemptNumber === 2) return 1;
  return 0;
}

export function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
