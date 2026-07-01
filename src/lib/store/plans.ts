// Kho content plan - lưu file .data/plans.json. Server-only.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';

export interface PlanItem {
  title: string;
  target: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  isPillar?: boolean;
  slug?: string; // slug URL gợi ý (để nối internal link pillar ↔ vệ tinh)
  cluster?: string; // cụm chủ đề (vệ tinh cùng cụm liên kết chéo)
}

export interface PlanRecord {
  id: string;
  keywordSetId: string;
  locale: string;
  title: string;
  seed: string;
  items: PlanItem[];
  createdAt: string;
}

const FILE = path.join(process.cwd(), '.data', 'plans.json');

async function readAll(): Promise<PlanRecord[]> {
  return readJson<PlanRecord[]>(FILE, []);
}

export async function savePlan(input: {
  keywordSetId: string;
  locale: string;
  title: string;
  seed: string;
  items: PlanItem[];
}): Promise<PlanRecord> {
  const record: PlanRecord = {
    id: 'plan_' + randomBytes(6).toString('hex'),
    createdAt: new Date().toISOString(),
    ...input,
  };
  return mutateJson<PlanRecord[], PlanRecord>(FILE, [], (rows) => [[...rows, record], record]);
}

export async function getPlan(id: string): Promise<PlanRecord | null> {
  return (await readAll()).find((r) => r.id === id) ?? null;
}

export async function listPlans(): Promise<PlanRecord[]> {
  return (await readAll()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function latestPlan(): Promise<PlanRecord | null> {
  return (await listPlans())[0] ?? null;
}

export async function deletePlan(id: string): Promise<void> {
  await mutateJson<PlanRecord[], void>(FILE, [], (rows) => [
    rows.filter((r) => r.id !== id),
    undefined,
  ]);
}
