// Data layer - hiện trả seed in-memory. Khi có DB, thay từng hàm bằng truy vấn Prisma
// (import { prisma } from '../prisma') mà không đổi chữ ký để pages không phải sửa.
import * as seed from './seed';

export const getProject = () => seed.project;
export const getStats = () => seed.stats;
export const getRecentArticles = () => seed.recentArticles;
export const getCoverage = () => seed.coverage;
export const getSampleKeywords = () => seed.sampleKeywords;
export const getPlan = () => ({ pillar: seed.planPillar, items: seed.planItems });
export const getConnections = () => seed.connections;
export const getTranslationGroup = () => seed.translationGroup;
export const getUpcoming = () => seed.upcoming;
export const getTopCited = () => seed.topCited;
export const getSampleArticle = () => seed.sampleArticle;

export type {
  SeedArticle,
  SeedKeyword,
  SeedPlanItem,
  SeedConnection,
  SeedTranslation,
} from './seed';
