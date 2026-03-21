import { db } from './db';

export async function getSetting(key: string, defaultValue?: string): Promise<string | undefined> {
  const record = await db.userSettings.get(key);
  return record ? record.value : defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.userSettings.put({ id: key, value });
}
