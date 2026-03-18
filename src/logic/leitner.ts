import type { FlashcardProgress } from '../types';

// Days until next review for each bucket (0-4)
export const BUCKET_INTERVALS: readonly number[] = [0, 1, 3, 7, 14];

export function getNextDue(bucket: number, now: Date = new Date()): string {
  const days = BUCKET_INTERVALS[Math.min(bucket, 4)] ?? 0;
  const next = new Date(now.getTime());
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export function applyAnswer(
  progress: FlashcardProgress,
  correct: boolean,
  now: Date = new Date()
): FlashcardProgress {
  const newBucket = correct ? Math.min(progress.bucket + 1, 4) : 0;
  return {
    ...progress,
    correctCount: correct ? progress.correctCount + 1 : progress.correctCount,
    incorrectCount: correct ? progress.incorrectCount : progress.incorrectCount + 1,
    streak: correct ? progress.streak + 1 : 0,
    lastSeen: now.toISOString(),
    nextDue: getNextDue(newBucket, now),
    bucket: newBucket,
  };
}

export function getDueCards(
  progressList: FlashcardProgress[],
  now: Date = new Date()
): FlashcardProgress[] {
  const nowStr = now.toISOString();
  return progressList
    .filter((p) => p.nextDue <= nowStr)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}
