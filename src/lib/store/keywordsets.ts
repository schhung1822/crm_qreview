// Kho bộ từ khóa - lưu file .data/keywordsets.json. Server-only.
import { randomBytes } from 'node:crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { getRepos, storageDriver } from '../data/repos';

export interface StoredKeyword {
  term: string;
  cluster: string;
  volume: number;
  difficulty: number;
  intent: string;
  type: 'seo' | 'geo';
  cpc?: number;
  competition?: number;
  trend?: 'up' | 'flat' | 'down';
  opportunity?: number;
}

export interface KeywordSetRecord {
  id: string;
  seed: string;
  locale: string;
  estimated: boolean;
  keywords: StoredKeyword[];
  clusters: string[];
  createdAt: string;
}

const NAME = 'keywordsets.json'; // CÔ LẬP THEO BIZ

async function readAll(): Promise<KeywordSetRecord[]> {
  if (storageDriver() === 'prisma') return (await getRepos()).keywordSets.all();
  return readJson<KeywordSetRecord[]>(bizFile(NAME), []);
}

export async function saveKeywordSet(input: {
  seed: string;
  locale: string;
  estimated: boolean;
  keywords: StoredKeyword[];
  clusters: string[];
}): Promise<KeywordSetRecord> {
  const record: KeywordSetRecord = {
    id: 'kw_' + randomBytes(6).toString('hex'),
    createdAt: new Date().toISOString(),
    ...input,
  };
  if (storageDriver() === 'prisma') {
    await (await getRepos()).keywordSets.insert(record);
    return record;
  }
  return mutateJson<KeywordSetRecord[], KeywordSetRecord>(bizFile(NAME), [], (rows) => [
    [...rows, record],
    record,
  ]);
}

export async function getKeywordSet(id: string): Promise<KeywordSetRecord | null> {
  if (storageDriver() === 'prisma') return (await getRepos()).keywordSets.get(id);
  return (await readAll()).find((r) => r.id === id) ?? null;
}

export async function listKeywordSets(): Promise<KeywordSetRecord[]> {
  return (await readAll()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deleteKeywordSet(id: string): Promise<void> {
  if (storageDriver() === 'prisma') {
    await (await getRepos()).keywordSets.remove(id);
    return;
  }
  await mutateJson<KeywordSetRecord[], void>(bizFile(NAME), [], (rows) => [
    rows.filter((r) => r.id !== id),
    undefined,
  ]);
}
