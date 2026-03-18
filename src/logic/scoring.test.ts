import { describe, it, expect } from 'vitest';
import { calculateSessionSummary, calculateSentenceScore, formatElapsedTime } from './scoring';

describe('calculateSentenceScore', () => {
  it('first-attempt correct = 2 points', () => {
    expect(calculateSentenceScore(1, true)).toBe(2);
  });

  it('second-attempt correct = 1 point', () => {
    expect(calculateSentenceScore(2, true)).toBe(1);
  });

  it('third-attempt correct = 0 points', () => {
    expect(calculateSentenceScore(3, true)).toBe(0);
  });

  it('no correct attempt = 0 points', () => {
    expect(calculateSentenceScore(1, false)).toBe(0);
    expect(calculateSentenceScore(2, false)).toBe(0);
  });
});

describe('calculateSessionSummary', () => {
  it('calculates correct percentage', () => {
    const summary = calculateSessionSummary(
      10,
      8,
      '2024-01-15T12:00:00Z',
      '2024-01-15T12:05:00Z'
    );
    expect(summary.accuracyPercent).toBe(80);
  });

  it('rounds accuracy to nearest integer', () => {
    const summary = calculateSessionSummary(
      3,
      1,
      '2024-01-15T12:00:00Z',
      '2024-01-15T12:01:00Z'
    );
    expect(summary.accuracyPercent).toBe(33);
  });

  it('returns 0% accuracy for 0 questions', () => {
    const summary = calculateSessionSummary(
      0,
      0,
      '2024-01-15T12:00:00Z',
      '2024-01-15T12:01:00Z'
    );
    expect(summary.accuracyPercent).toBe(0);
  });

  it('calculates elapsed time in milliseconds', () => {
    const summary = calculateSessionSummary(
      5,
      5,
      '2024-01-15T12:00:00Z',
      '2024-01-15T12:02:30Z'
    );
    expect(summary.elapsedMs).toBe(150000); // 2m 30s = 150000ms
  });

  it('returns totalQuestions and correctAnswers', () => {
    const summary = calculateSessionSummary(
      20,
      15,
      '2024-01-15T12:00:00Z',
      '2024-01-15T12:05:00Z'
    );
    expect(summary.totalQuestions).toBe(20);
    expect(summary.correctAnswers).toBe(15);
  });
});

describe('formatElapsedTime', () => {
  it('formats seconds only', () => {
    expect(formatElapsedTime(45000)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatElapsedTime(150000)).toBe('2m 30s');
  });

  it('formats zero', () => {
    expect(formatElapsedTime(0)).toBe('0s');
  });

  it('formats exactly 1 minute', () => {
    expect(formatElapsedTime(60000)).toBe('1m 0s');
  });
});
