import { db } from './db';
import type { FlashcardProgress, SessionLog } from '../types';

export async function getProgressForUnit(unitId: number): Promise<FlashcardProgress[]> {
  return db.flashcardProgress.where('unitId').equals(unitId).toArray();
}

export async function getProgressForEntry(entryId: number): Promise<FlashcardProgress | undefined> {
  return db.flashcardProgress.where('entryId').equals(entryId).first();
}

export async function updateProgress(progress: FlashcardProgress): Promise<void> {
  if (progress.id !== undefined) {
    await db.flashcardProgress.put(progress);
  }
}

export async function logSession(log: SessionLog): Promise<number> {
  return db.sessionLogs.add(log);
}

export async function getSessionsForUnit(unitId: number): Promise<SessionLog[]> {
  return db.sessionLogs.where('unitId').equals(unitId).toArray();
}

export async function getAllProgress(): Promise<FlashcardProgress[]> {
  return db.flashcardProgress.toArray();
}

export async function getAllSessions(): Promise<SessionLog[]> {
  return db.sessionLogs.toArray();
}

export async function resetAllProgress(): Promise<void> {
  const now = new Date().toISOString();
  const entries = await db.entries.toArray();

  await db.transaction('rw', [db.flashcardProgress], async () => {
    await db.flashcardProgress.clear();
    const progressRecords: FlashcardProgress[] = entries.map((entry) => ({
      entryId: entry.id!,
      unitId: entry.unitId,
      correctCount: 0,
      incorrectCount: 0,
      streak: 0,
      lastSeen: now,
      nextDue: now,
      bucket: 0,
    }));
    if (progressRecords.length > 0) {
      await db.flashcardProgress.bulkAdd(progressRecords);
    }
  });
}

export interface ProgressExport {
  exportedAt: string;
  version: string;
  flashcardProgress: FlashcardProgress[];
  sessionLogs: SessionLog[];
}

export async function exportProgressData(): Promise<ProgressExport> {
  const [flashcardProgress, sessionLogs] = await Promise.all([
    db.flashcardProgress.toArray(),
    db.sessionLogs.toArray(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    version: '1',
    flashcardProgress,
    sessionLogs,
  };
}

export async function importProgressData(data: ProgressExport): Promise<void> {
  await db.transaction('rw', [db.flashcardProgress, db.sessionLogs], async () => {
    for (const record of data.flashcardProgress) {
      await db.flashcardProgress.put(record);
    }
    for (const record of data.sessionLogs) {
      await db.sessionLogs.put(record);
    }
  });
}
