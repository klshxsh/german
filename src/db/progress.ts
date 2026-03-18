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
