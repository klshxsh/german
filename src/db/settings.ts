import { db } from './db';

export async function getSetting(key: string): Promise<string | null> {
  const record = await db.appSettings.where('key').equals(key).first();
  return record ? record.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.appSettings.where('key').equals(key).first();
  if (existing?.id !== undefined) {
    await db.appSettings.update(existing.id, { value });
  } else {
    await db.appSettings.add({ key, value });
  }
}
