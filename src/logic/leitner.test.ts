import { describe, it, expect } from 'vitest';
import { applyAnswer, getDueCards, getNextDue, BUCKET_INTERVALS } from './leitner';
import { makeFlashcardProgress } from '../test/factories';

function daysFromNow(days: number, from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

describe('BUCKET_INTERVALS', () => {
  it('has 5 buckets with correct day intervals', () => {
    expect(BUCKET_INTERVALS).toEqual([0, 1, 3, 7, 14]);
  });
});

describe('getNextDue', () => {
  it('bucket 0 sets nextDue to now', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const result = getNextDue(0, now);
    expect(result).toBe(new Date('2024-01-15T12:00:00Z').toISOString());
  });

  it('bucket 1 sets nextDue to now + 1 day', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const result = getNextDue(1, now);
    expect(result).toBe(daysFromNow(1, now).toISOString());
  });

  it('bucket 2 sets nextDue to now + 3 days', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const result = getNextDue(2, now);
    expect(result).toBe(daysFromNow(3, now).toISOString());
  });

  it('bucket 3 sets nextDue to now + 7 days', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const result = getNextDue(3, now);
    expect(result).toBe(daysFromNow(7, now).toISOString());
  });

  it('bucket 4 sets nextDue to now + 14 days', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const result = getNextDue(4, now);
    expect(result).toBe(daysFromNow(14, now).toISOString());
  });
});

describe('applyAnswer - bucket transitions', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  it('correct answer moves card from bucket 0 to bucket 1', () => {
    const progress = makeFlashcardProgress({ bucket: 0 });
    const result = applyAnswer(progress, true, now);
    expect(result.bucket).toBe(1);
  });

  it('correct answer moves card from bucket 3 to bucket 4', () => {
    const progress = makeFlashcardProgress({ bucket: 3 });
    const result = applyAnswer(progress, true, now);
    expect(result.bucket).toBe(4);
  });

  it('correct answer on bucket 4 stays at bucket 4', () => {
    const progress = makeFlashcardProgress({ bucket: 4 });
    const result = applyAnswer(progress, true, now);
    expect(result.bucket).toBe(4);
  });

  it('incorrect answer resets bucket 3 to bucket 0', () => {
    const progress = makeFlashcardProgress({ bucket: 3 });
    const result = applyAnswer(progress, false, now);
    expect(result.bucket).toBe(0);
  });

  it('incorrect answer resets bucket 1 to bucket 0', () => {
    const progress = makeFlashcardProgress({ bucket: 1 });
    const result = applyAnswer(progress, false, now);
    expect(result.bucket).toBe(0);
  });

  it('incorrect answer resets bucket 0 to bucket 0', () => {
    const progress = makeFlashcardProgress({ bucket: 0 });
    const result = applyAnswer(progress, false, now);
    expect(result.bucket).toBe(0);
  });
});

describe('applyAnswer - nextDue', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  it('correct answer from bucket 0 sets nextDue to now + 1 day', () => {
    const progress = makeFlashcardProgress({ bucket: 0 });
    const result = applyAnswer(progress, true, now);
    expect(result.nextDue).toBe(daysFromNow(1, now).toISOString());
  });

  it('incorrect answer resets nextDue to now', () => {
    const progress = makeFlashcardProgress({ bucket: 3 });
    const result = applyAnswer(progress, false, now);
    expect(result.nextDue).toBe(now.toISOString());
  });
});

describe('applyAnswer - counts and streak', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  it('streak increments on correct answer', () => {
    const progress = makeFlashcardProgress({ streak: 2 });
    const result = applyAnswer(progress, true, now);
    expect(result.streak).toBe(3);
  });

  it('streak resets to 0 on incorrect answer', () => {
    const progress = makeFlashcardProgress({ streak: 5 });
    const result = applyAnswer(progress, false, now);
    expect(result.streak).toBe(0);
  });

  it('correct answer increments correctCount', () => {
    const progress = makeFlashcardProgress({ correctCount: 3 });
    const result = applyAnswer(progress, true, now);
    expect(result.correctCount).toBe(4);
    expect(result.incorrectCount).toBe(0);
  });

  it('incorrect answer increments incorrectCount', () => {
    const progress = makeFlashcardProgress({ incorrectCount: 2 });
    const result = applyAnswer(progress, false, now);
    expect(result.incorrectCount).toBe(3);
    expect(result.correctCount).toBe(0);
  });

  it('updates lastSeen to now', () => {
    const progress = makeFlashcardProgress({ lastSeen: '2020-01-01T00:00:00Z' });
    const result = applyAnswer(progress, true, now);
    expect(result.lastSeen).toBe(now.toISOString());
  });
});

describe('getDueCards', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  it('returns only cards where nextDue <= now', () => {
    const past = daysFromNow(-1, now).toISOString();
    const future = daysFromNow(1, now).toISOString();
    const progressList = [
      makeFlashcardProgress({ entryId: 1, nextDue: past }),
      makeFlashcardProgress({ entryId: 2, nextDue: future }),
      makeFlashcardProgress({ entryId: 3, nextDue: now.toISOString() }),
    ];
    const due = getDueCards(progressList, now);
    expect(due).toHaveLength(2);
    expect(due.map((p) => p.entryId)).toContain(1);
    expect(due.map((p) => p.entryId)).toContain(3);
  });

  it('returns empty array when no cards are due', () => {
    const future = daysFromNow(1, now).toISOString();
    const progressList = [
      makeFlashcardProgress({ entryId: 1, nextDue: future }),
      makeFlashcardProgress({ entryId: 2, nextDue: future }),
    ];
    expect(getDueCards(progressList, now)).toHaveLength(0);
  });

  it('returns all cards when all are due', () => {
    const past = daysFromNow(-1, now).toISOString();
    const progressList = [
      makeFlashcardProgress({ entryId: 1, nextDue: past }),
      makeFlashcardProgress({ entryId: 2, nextDue: past }),
    ];
    expect(getDueCards(progressList, now)).toHaveLength(2);
  });

  it('orders by nextDue ascending (oldest due first)', () => {
    const oldest = new Date('2024-01-10T00:00:00Z').toISOString();
    const middle = new Date('2024-01-12T00:00:00Z').toISOString();
    const newest = new Date('2024-01-14T00:00:00Z').toISOString();
    const progressList = [
      makeFlashcardProgress({ entryId: 3, nextDue: newest }),
      makeFlashcardProgress({ entryId: 1, nextDue: oldest }),
      makeFlashcardProgress({ entryId: 2, nextDue: middle }),
    ];
    const due = getDueCards(progressList, now);
    expect(due.map((p) => p.entryId)).toEqual([1, 2, 3]);
  });
});
