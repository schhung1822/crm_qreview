import { randomBytes } from 'node:crypto';
import { activeBizId, bizFile } from '../data/biz-path';
import { mutateJson } from '../data/json-store';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';

export interface RevisionRecord { id: string; connectionId: string; cmsPostId: string; title: string; contentHtml: string; metaDescription?: string; snapshotOk: boolean; reason: string; createdAt: string; }
const NAME = 'revisions.json';
const MAX_REVISIONS = 500;
const isDb = () => storageDriver() === 'prisma';
const biz = () => { const id = activeBizId(); if (!id) throw new Error('Missing active biz context.'); return id; };

export async function saveRevision(input: Omit<RevisionRecord, 'id' | 'createdAt'>): Promise<RevisionRecord> {
  const record: RevisionRecord = { ...input, id: 'rev_' + randomBytes(8).toString('hex'), createdAt: new Date().toISOString() };
  if (isDb()) { await prisma.revision.create({ data: { ...record, bizId: biz(), metaDescription: record.metaDescription ?? null, createdAt: new Date(record.createdAt) } }); return record; }
  await mutateJson<RevisionRecord[], void>(bizFile(NAME), [], (rows) => { const next = [...rows, record]; next.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); return [next.slice(0, MAX_REVISIONS), undefined]; });
  return record;
}
